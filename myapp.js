'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

var needStop = false; // 控制停止计算,收到新块后停止，dothing 时还原
var toDoData = "待写入的数据";

/*
 模拟算力竞赛
 每当我们 进入 到 donothing 的时候 立即开始计算下一个区块（data值可以固定，只为测试用）
 发布新区块的时候带上自己的name，这样知道是谁写入成功的。
 难度值暂时固定为5、或者6

 再进一步，可以改成难度值动态添加，每10个区块难度值+1之类的
*/

class Block {
    constructor(index, previousHash, timestamp, data, nonce, hash) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.nonce = nonce;
        this.hash = hash.toString();
    }
}

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

var getGenesisBlock = () => {
    return new Block(0, "0", 1465154705, "my genesis block!!", 0, "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};

var blockchain = [getGenesisBlock()];

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => {
    	// 如果不停止的话，会很慢
    	needStop = true;
    	res.send(JSON.stringify(blockchain));
    	needStop = false;
    });
    app.post('/mineBlock', (req, res) => {
    	needStop = true;
        mineBlock(req.body.data);
    	needStop = false;
        res.end();
    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};



var initP2PServer = () => {
    var server = new WebSocket.Server({ port: p2p_port });
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);

};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    // 要最后一个区块
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
        	// 收到消息要最后一个区块
            case MessageType.QUERY_LATEST:
            	// 回复最后一个区块
                write(ws, responseLatestMsg());
                break;
            // 要所有区块
            case MessageType.QUERY_ALL:
            	// 回复整个链
                write(ws, responseChainMsg());
                break;
            // 收到一个新的区块 或者 整个链
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};


var generateNextBlock = (blockData) => {
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = new Date().getTime() / 1000;
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
};



function checkDifficulty(hash, n) {
    if (!n) return true;
    var m = hash.match(/^(0+)/g);
    if (!m) return false;
    if (m[0].length >= n) return true;
}

var calculateHashWithNonce = (index, previousHash, timestamp, data, nonce) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data + nonce).toString();
};

var getHashNonce = (index, pvHash, timestamp, blockData, nonce, difficulty = 4) => {
    // nonce 从 1 开始无限加
    for (nonce = 1;; nonce++) {
        // 收到新的块了 停止计算, 调用方停止下一步，由收到新的块执行之后的逻辑
        if (needStop) return false;
        var hash = calculateHashWithNonce(index, pvHash, timestamp, blockData, nonce);
        if (checkDifficulty(hash, difficulty)) {
            return [hash, nonce];
        }
    }
}

// 比预想中的复杂，我们在nonce计算的时候，何时停止，何时开始待商榷
// needStop并不能保证不会同时执行两个挖矿函数，所以加了另一个参数做判断

var countIng = false;

function generateBlockWithDifficulty(blockData) {
	if (countIng) return;
	countIng = true;	

	console.log('正在计算一个新的区块');
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = Math.ceil(new Date().getTime() / 1000);
    var result = getHashNonce(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    countIng = false;
    // 需要停止，没有产生新的块
    if (!result) return false;
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, result[1], result[0]);
}


var calculateHashForBlock = (block) => {
    return calculateHashWithNonce(block.index, block.previousHash, block.timestamp, block.data, block.nonce);
};

var calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
    	needStop = true;
        blockchain.push(newBlock);
        return true;
    }
};

function mineBlock(data) {
    var newBlock = generateBlockWithDifficulty(data || toDoData);
    if (!newBlock) {
        console.log('被停止了，创建块失败');
        return false;
    }
    var res = addBlock(newBlock);
    if (!res) {
        console.log('无效的块');    	
    	return false;
    }
    broadcast(responseLatestMsg());
    console.log('block added: ' + JSON.stringify(newBlock));
    return true;
}

function doNothing() {
	console.log('nothing to do, geting to start a new block creating...');
	needStop = false;
	mineBlock();

	setTimeout(function() {
		if (!needStop && !countIng) mineBlock();
	}, 3000)
}

var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof(newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = (message) => {
	// 收到新块的第一时间停止计算了，但是没有对这个块做有效性验证
    

    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();

    // 对方比我们高吗？
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
 		// 高一个高度
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            needStop = true;
            blockchain.push(latestBlockReceived);
            doNothing();
            broadcast(responseLatestMsg());
        // 收到了一个块，但是这个块不是比我们高一个高度，这里有疑问，所以跟对方要了一整条链，收到整条链的时候会做整条链有效性验证，有效的话替换整条链
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
 			// needStop = true; // 不计算了，等着对方给我一条链，然后计算有效性
            // 要一整条链
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
 			needStop = true; // 不计算了，等着对方给我一条链，然后计算有效性
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than current blockchain. Do nothing\n');
        doNothing();
    }
};

var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid');
    }
    doNothing();
};

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({ 'type': MessageType.QUERY_LATEST });
var queryAllMsg = () => ({ 'type': MessageType.QUERY_ALL });

// 回复整个链
var responseChainMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();