var CryptoJS = require("crypto-js");
var difficultyStart = 0;


var calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

var calculateHashWithNonce = (index, previousHash, timestamp, data, nonce) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data + nonce).toString();
};

var generateBlockWithDifficulty = (blockData, n = 5) => {
    var pvHash = '9f055bedc5068868c2dfe8c6cf336812e8fe2e3afccd261e9c9cdc9ff8101f31';
    var index = 2;
    var timestamp = Math.ceil(Date.now() / 1000);

    // nonce 从 1 开始无限加
	for (nonce = 1; ; nonce++) {
		// 收到新的块了 停止计算
		// if (needStop) return false;
	    var hash = calculateHashWithNonce(index, pvHash, timestamp, blockData, nonce);
	    if (checkDifficulty(hash, n)) {
	    	return [hash, nonce];
	    }
	}
} 

function checkDifficulty(hash, n) {
	if (!n) return true;
	var m = hash.match(/^(0+)/g);
	if (!m) return false;
	if (m[0].length >= n) return true;	
}


// var a = generateBlockWithDifficulty('json:{"data": "hello world."}', difficulty);

function generateFromDifficultyStart() {
	var start = new Date();
	console.log(start.toString(), '开始新的计算,难度值', difficultyStart);

	var result = generateBlockWithDifficulty('json:{"data": "hello world."}', difficultyStart++);
	console.log('hash: ' + result[0]);
	console.log('nonce: ' + result[1]);
	console.log('用时' + (Date.now() - start.getTime()) / 1000 + 's\n');
	generateFromDifficultyStart();
}

console.log('开始测试计算速度\n');
generateFromDifficultyStart();
