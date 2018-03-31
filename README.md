参考仓库：[naivechain](https://github.com/lhartikk/naivechain)
在该项目的基础上增加了难度值计算

### Quick start

```shell
npm install
node main
```


##### Get blockchain

```shell
curl http://localhost:3001/blocks
```

##### Create block

```shell
curl -H "Content-type:application/json" --data '{"data" : "Some data to the first block"}' http://localhost:3001/mineBlock
```


##### Add peer

```shell
curl -H "Content-type:application/json" --data '{"peer" : "ws://localhost:6001"}' http://localhost:3001/addPeer
```

#### Query connected peers

```shell
curl http://localhost:3001/peers
```

测试本机算力

```shell
node test
```
