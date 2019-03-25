// Learn cc.Class:
//  - [Chinese] http://docs.cocos.com/creator/manual/zh/scripting/class.html
//  - [English] http://www.cocos2d-x.org/docs/creator/en/scripting/class.html
// Learn Attribute:
//  - [Chinese] http://docs.cocos.com/creator/manual/zh/scripting/reference/attributes.html
//  - [English] http://www.cocos2d-x.org/docs/creator/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - [Chinese] http://docs.cocos.com/creator/manual/zh/scripting/life-cycle-callbacks.html
//  - [English] http://www.cocos2d-x.org/docs/creator/en/scripting/life-cycle-callbacks.html

let Utils = require("./common/UtilsOther");
let Toast = require("./views/ToastCtrl");
let Dialog = require("./views/DialogCtrl");

cc.Class({
    extends: cc.Component,

    properties: {
        seats:[cc.Node],
        cardHeapSeat: cc.Node,
        multLabel: cc.Label,
        mult: {
            default: 1,
            type: cc.Integer,
            min: 1,
            max: 50,
            notify(){
                this.multLabel.string = this.mult + "倍场";
            }
        },
        betTimeLabel: cc.Label,
    },

    // LIFE-CYCLE CALLBACKS:

    onLoad () {
        // 自己在正中间
        this.selfNodeCtrl = this.getPlayerNode(2).getComponent("PlayerCtrl");
        this.startBets = false;  // 开始下注
        this.betsTime = 5;       // 等待下注时间
        this.bankerSeat = -1;    // 庄家座位号
        this.cardsArr = [];      // 当前牌堆
        this.nextBankerSeat = -1;    // 下一个庄家
        this.mult = Global.config.roomMulti;
        this.betTimeLabel.node.parent.active = false;
    },

    start () {
        this.schedule(this.myUpdate, 0.1);
        this.initGame();

        this.scheduleOnce(()=>{
            this.startGame();
        }, 0.5);

        Global.audioMgr.playMusic(Global.audioMgr.gameMusic);
    },

    initGame(){
        let names = ["玛利亚", "波多", "吉野君", "椎名空", "筱田步美", "佐佐木明希", "高桥圣子", "三上悠亚", "水野朝阳"];
        // 随机4个玩家, 中间座位为自己
        for(let i=0; i<5; i++){
            if (i != 2){
                let index = Utils.randomInteger(0, names.length-1);
                let name = names[index];
                names.splice(index,1);
                let coins = 100000;
                this.getPlayerNode(i).getComponent("PlayerCtrl").initPlayer(name, null, coins);
            }
        }

        // 初始化自己
        this.selfNodeCtrl.initPlayer("逢赌必赢君", "myicon", Global.dataMgr.playerObj.coins);

        // 开局随机一个庄家
        this.bankerSeat = this.nextBankerSeat = Utils.randomInteger(0,4);

        // 初始化牌堆
        this.cardsArr = create1pairPoker(true);

    },

    /**
     * 获取发牌顺序（座位号), 从庄家开始逆时针发牌
     * @return {Array}
     */
    getDealSeatOrder(){
        let order = [];
        let tmp = this.bankerSeat;
        while (tmp <= 4){
            order.push(tmp++);
        }
        tmp = 0;
        while (tmp < this.bankerSeat){
            order.push(tmp++);
        }

        return order;
    },

    // 清理游戏，方便开始下一局
    cleanGame(){
        this.betsTime = 5;
        for (let i = 0; i<5; i++){
            let p = this.getPlayerNode(i).getComponent("PlayerCtrl");
            p.clearHands();
        }
    },

    /**
     *
     * @param seatIndex
     * @return {cc.Node}
     */
    getPlayerNode(seatIndex){
        cc.assert(seatIndex >= 0 && seatIndex <= 4, "wrong seatIndex!");
        return this.seats[seatIndex].getChildByName("PlayerNode");
    },

    startGame(){
        // 金币不足无法继续
        if (Global.dataMgr.playerObj.coins < this.mult * 50 * 4){
            Dialog.show("金币不足" + this.mult * 50 * 4 + "，请充值.", null, "确定", null, ()=>{
                Global.loadScene("Lobby");
            });
            return;
        }

        this.getPlayerNode(this.bankerSeat).getComponent("PlayerCtrl").isBanker = true;

        this.scheduleOnce(()=>{
            this.startDeal(3, ()=>{
                Toast.showText("请开始下注.", 1, ()=>{
                    this.startBets = true;
                    this.robotDown();
                });
                Global.audioMgr.playEffect(Global.audioMgr.effMdls);
                this.selfNodeCtrl.showMenu = !this.selfNodeCtrl.isBanker;
            });
        }, 0.5);
    },

    // 机器开始下注
    robotDown(){
        // 自动给机器人下注
        let orders = this.getDealSeatOrder();
        for(let i = 0; i < orders.length; i ++){
            let seat = orders[i];
            let player = this.getPlayerNode(seat).getComponent("PlayerCtrl");

            if (seat === 2 || player.isBanker) continue;

            // 机器人自动加钱
            if (player.coins < 2000){
                player.coins = 100000;
            }
            player.payBet(-1, Math.random() + 0.5);
        }
    },

    /**
     *
     * @param count{Number} 发牌张数
     * @param cb{function} 回调函数
     */
    startDeal(count, cb){
        cc.log("开始发牌." + count + "张.");
        let self = this;
        let t = 0;
        let zIndex = Global.config.LOCAL_ZINDEX_MAX;
        let root = self.cardHeapSeat.parent;

        let order = this.getDealSeatOrder();

        if (this.cardsArr.length < count * 5){
            cc.log("牌不够，洗牌.");
            this.cardsArr = create1pairPoker(true);
        }

        for (let seat of order){
            let cards = this.cardsArr.slice(0, count);
            sortBig2Samll(cards);
            this.cardsArr = this.cardsArr.slice(count);
            _dealAct(seat, cards);
        }

        // 执行发牌并展示动画
        function _dealAct(seat, cards) {
            let playerCtrl = self.getPlayerNode(seat).getComponent("PlayerCtrl");
            for (let i=0; i<cards.length; i++){
                let cardObj = cards[i];
                playerCtrl.hands.push(cardObj); // 真发牌
                let card = cc.instantiate(Global.assetMgr.cardPrefab);
                card.getComponent("CardCtrl").initCard(cardObj.point, cardObj.suit, seat === 2);
                card.scale = 0.5;
                card.zIndex = zIndex;
                let posOri = root.convertToNodeSpaceAR(root.convertToWorldSpaceAR(self.cardHeapSeat.getPosition()));
                let posDes = root.convertToNodeSpaceAR(playerCtrl.cardPanelLeft.convertToWorldSpaceAR(cc.v2(0,0)));
                root.addChild(card);
                card.setPosition(posOri);
                card.runAction(cc.sequence(cc.delayTime(t), cc.moveTo(0.1,posDes), cc.callFunc(()=>{
                    card.removeFromParent(true);
                    card.x = card.y = 0;
                    card.scale = 1;
                    playerCtrl.cardPanelLeft.addChild(card);
                    Global.audioMgr.playEffect(Global.audioMgr.effFapai);
                })));

                t += 0.1;
                zIndex --;
            }
        }

        this.scheduleOnce(cb, t + 0.5);
    },

    // 开牌比较大小
    openHands(){
        cc.log("开始开牌");
        let orders = this.getDealSeatOrder();
        let t = 0.6;
        for (let i=0; i<orders.length; i++){
            let seat = orders[i];
            this.getPlayerNode(seat).getComponent("PlayerCtrl").openHands(t * i);
        }

        this.scheduleOnce(this.countReward, t * 5);
    },

    /**
     *  计算牌型倍数
     * @param typeReturn{TypeReturn}
     * 牛牛 this.mult倍，牛9减一倍，牛8减二倍，直到剩余一倍
     */
    countMult(typeReturn){
        if (this.mult <= 1) return 1;
        let mult = 1;
        if (typeReturn.handsType === HandsType.TYPE_NONE){
            mult = 1;
        }  else {
            mult = this.mult + (typeReturn.handsType - HandsType.TYPE_NIUNIU);
        }

        mult = Math.max(mult, 1);
        return mult;
    },

    // 结算
    countReward(){
        cc.log("结算");
        let banker = this.getPlayerNode((this.bankerSeat)).getComponent("PlayerCtrl");
        let bankerType = banker.typeReturn;
        let bankerReward = 0;

        let orders = this.getDealSeatOrder();
        orders.splice(0,1);
        for (let seat of orders){
            let player = this.getPlayerNode(seat).getComponent("PlayerCtrl");
            let pType = player.typeReturn;
            if (pType.handsType === HandsType.TYPE_NIUNIU){
                this.nextBankerSeat = seat;
            }
            if (compareHandsReturn(bankerType, pType)){
                // 庄家赢
                let multi = this.countMult(bankerType);
                bankerReward += player.curBets * multi;
                player.addReward(-player.curBets * multi);

            } else {
                // 闲家赢
                let multi = this.countMult(pType);
                bankerReward -= player.curBets * multi;
                player.addReward(player.curBets * multi);
            }
        }
        banker.addReward(bankerReward);

        Global.dataMgr.playerObj.coins = this.selfNodeCtrl.coins;
        Global.dataMgr.saveDataToLocal();

        this.scheduleOnce(()=>{
            // 开始下一局
            Dialog.show("继续玩？", "取消", "确定", ()=>{
                Global.loadScene("Lobby");
            }, ()=>{
                this.cleanGame();
                this.bankerSeat = this.nextBankerSeat;
                this.startGame();
            });
        }, 1.5);
    },

    myUpdate (dt) {
        if (!this.startBets){
            return;
        }

        this.betTimeLabel.string = Math.ceil(this.betsTime);
        this.betsTime -= dt;
        if (this.betsTime > 0){
            this.betTimeLabel.node.parent.active = true;
            let allOk = true;
            for(let seat of this.seats){
                let player = seat.getChildByName("PlayerNode").getComponent("PlayerCtrl");
                if(player.curBets <= 0 && !player.isBanker){
                    allOk = false;
                }
            }
            if (allOk){
                // 都下好注开始发牌
                this.startBets = false;
            }
        } else {
            // 超时自动下注最小bet, 按照顺序，逆时针开始
            let orders = this.getDealSeatOrder();
            for(let seat of orders){
                let player = this.getPlayerNode(seat).getComponent("PlayerCtrl");
                if(player.curBets <= 0){
                    player.onBtnDown(null,1);    // 超时自动下注最小bet
                    this.startBets = false;
                    cc.log("超时自动下注.");
                }
            }
        }

        // 已经下好注，开始发生于的2张牌
        if (!this.startBets){
            this.betTimeLabel.node.parent.active = false;
            this.startDeal(2, ()=>{
                this.openHands();
            });
        }
    },
});
