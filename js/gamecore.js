var aiWorker = new Worker('./libs/aiworker.js');
var Move = function(f, t, p) {
    this.from = f;
    this.to = t;
    this.player = p;
};

var Player = {
    team: '',
    pos: '',
    homeFlag: true,
}

var gameCore = {
	AIPos: 0b00000000001111100000, //Top left pieces
	HUPos: 0b00000111110000000000, //Bottom right pieces
	playerOneFlag: true, // The AI/Opponent
	playerTwoFlag: true, // The human/local
	humanteam: 'muon',
	finalWinner:'',
	opponentTeam: '',
	aiStart: 0,
	aiEnd: 0,
	AITurn: true,	// Flag for the current player's turn
	MAX_HIST: 40,		// Maximum moves to keep track of
	moveHistory: [],	// A history of the moves made by both players
	moveCount: 0,
	drawProb: 0,
	winner: "none",		// To display if the local player won or lost
	gameOver: false,	// Stop allowing the selection of muons if true
	attemptedDraw: false,
	AIGoesFirst:false,
	AITreeDepth: 7,
	pvp: {
		enabled: false,
		p1Team: '',
		p2Team: '',
		p1Pos: '',
		p2Pos: '',
		turn: 1,
		p1Flag: true,
		p2Flag: true,
		first: 'muon',
		winner: '',
	},
	network: {
		team: '',
		turn: '',
		role: '',
		roomid: null,
		localFlag: true,
		localPos: '',
		localStartPos: '',
		opponentPos: '',
		opponentStartPos: '',
		opponentFlag: true,
		MakeOpponentMove: function(from, to){
			var bitFrom = convert.intToBit(from);
			var bitTo = convert.intToBit(to);
			console.log("opponent moved from " + convert.bitToStandard(bitFrom) + " to " + convert.bitToStandard(bitTo));

			// Update opponents bit board.
			gameCore.network.opponentPos ^= bitFrom ^ bitTo;
			gameCore.AddMoveToHistory(new Move(from, to, "opponent"));
			gameCore.board.moveMuonTweenFoci(from, to);

			//remove opponent flag if needed
			if(evaluation.isHomeQuadEmpty((gameCore.network.role == 'host') ? 1 : 2, gameCore.network.opponentPos)) {
				gameCore.network.opponentFlag = false;
				if (gameCore.network.role == "host")
				{
					BoardGUI.removeAntiMuonFlag();
				}
				else
				{
					BoardGUI.removeMuonFlag();
				}
				console.log("Opponent can now win from their home quad");
			}

			if (gameCore.network.CheckForOpponentWin()) {
				setTimeout(function(){
					gameCore.network.EndNetworkGame();
				}, 2000);
			}
		},
		CheckForOpponentWin: function() {
			player = (gameCore.network.role == 'host') ? 1 : 2;
			if (evaluation.Win(gameCore.network.opponentPos, player, gameCore.network.opponentFlag, gameCore.network.localFlag)) {
				gameCore.winner = 'opponent';
				return true;
			} else {
				return false;
			}
		},
		CheckForLocalWin: function() {
			player = (gameCore.network.role == 'host') ? 2 : 1;
			if (evaluation.Win(gameCore.network.localPos, player, gameCore.network.opponentFlag, gameCore.network.localFlag)) {
				gameCore.winner = 'local';
				return true;
			} else {
				return false;
			}
		},
		EndNetworkGame: function(){
			gameCore.gameOver = true;	// Lock the board from player input
			if (gameCore.winner == "local") {
				console.log("YOU WON!");
				var foci = evaluation.Win(gameCore.network.localPos, player, gameCore.network.opponentFlag, gameCore.network.localFlag);
				if(gameCore.network.team == 'muon')
					gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],true);
				else
					gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],false);
				gameCore.board.gameOverModal = BoardGUI.showWinModal;
			}
			else if (gameCore.winner == "opponent"){
				console.log("YOU LOST!");
				var foci = evaluation.Win(gameCore.network.opponentPos, player, gameCore.network.opponentFlag, gameCore.network.localFlag);
				if(gameCore.network.team == 'muon')
					gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],false);
				else
					gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],true);
				gameCore.board.gameOverModal = BoardGUI.showLoseModal;
			}
			else
				console.log("IT'S A DRAW!");
			
		}
	},
	board: {
		nodes: [],
		links: [],
		width: 700,
    	height: 700,
    	noderadius: 30,
    	winningFoci: null,
		foci: 	[{x: 63, y: 63},		{x: 295, y: 60},		//
        				{x: 177, y: 178},				// Quad A
				{x: 63, y: 294},		{x: 295, y: 295},	//

				{x: 405, y: 405},	{x: 640, y: 405},	//
        				{x: 520, y: 520},				// Quad D
				{x: 405, y: 637},	{x: 640, y: 640},	//
                
				{x: 405, y: 60},		{x: 640, y: 60},		//
      					{x: 522, y: 180},				// Quad B
				{x: 405, y: 300},	{x: 640, y: 295},	//
                
				{x: 65, y: 400},		{x: 295, y: 405},	//
         				{x: 180, y: 520},				// Quad C
				{x: 65, y: 637},		{x: 295, y: 637},   //
						
						{x: 346, y: 247},			//
				{x: 227, y: 457},{x: 475, y: 457}],	//WIN ANIMATION POSITIONS
        boardSVG: null,
        d3force: null,
        activeNodes: null,
        activeLinks: null,
        selectedMuon: null,
        spinningMuon: null,
        ready: false,
        antidegreeindex: 0,
        tick: function(e){
        	var k = .1 * e.alpha;

		    //Push center nodes toward their designated focus.
		    gameCore.board.nodes.forEach(function(o, i) {
				if(typeof o.foci !== "undefined"){
					var focix = gameCore.board.foci[o.foci].x;
					var fociy = gameCore.board.foci[o.foci].y;
					o.y += (fociy - o.y) * k;
					o.x += (focix - o.x) * k;
				}
		    });

		    // Exit any old gameCore.board.nodes.
		    gameCore.board.activeNodes.exit().remove();

		    // Exit any old links
		    gameCore.board.activeLinks.exit().remove();

		    gameCore.board.activeNodes
		    	.attr("cx", function(d) { return d.x = Math.max(6, Math.min(gameCore.board.width - 6, d.x)); })
        		.attr("cy", function(d) { return d.y = Math.max(6, Math.min(gameCore.board.height - 6, d.y)); });

		    gameCore.board.activeLinks
		      .attr("x1", function(d) { return d.source.x; })
		      .attr("y1", function(d) { return d.source.y; })
		      .attr("x2", function(d) { return d.target.x; })
		      .attr("y2", function(d) { return d.target.y; })
        },
        beginRotatingSelectedMuon: function(nodesOfMuon, muon, point){
        	//while its selected keep on rotating
        	if(gameCore.board.spinningMuon != muon){
        		gameCore.board.spinningMuon = muon;
	        	d3.timer(function(){
	        		if(muon == gameCore.board.selectedMuon)
	        		{
		        		nodesOfMuon
					    .attr("cx", function(d) {
							if(d.angle>(2*Math.PI)){
								d.angle=0;
							} else if (d.angle < 0){
								d.angle = (2*Math.PI)
							}

							d.x = point.x + gameCore.board.noderadius * Math.cos(d.angle)
							return d.x;
					    })
					    .attr("cy", function(d) {
							d.y = point.y + gameCore.board.noderadius * Math.sin(d.angle)
							return d.y;
					    });
					    
				    
					    nodesOfMuon.each(function(d){
					    	if(!d.antimuon)
					    		d.angle+=0.05;
					    	else 
					    		d.angle -=0.05;
					    })

					    nodesOfMuon
					      .attr("cx", function(d) { return d.x; })
					      .attr("cy", function(d) { return d.y; })

					    gameCore.board.activeLinks
					      .attr("x1", function(d) { return d.source.x; })
					      .attr("y1", function(d) { return d.source.y; })
					      .attr("x2", function(d) { return d.target.x; })
					      .attr("y2", function(d) { return d.target.y; })
					} else {
						return true;
						gameCore.board.selectedMuon = null;
					}
	        	});
			} else {
				//stop rotating the muon
				gameCore.board.selectedMuon = null;
				gameCore.board.spinningMuon = null;
			}
        },
        mousedown: function() {

			var point = d3.mouse(this);
			var maxdist = 30
			var maxFociDist = 45;
			var	exit = false; // Used to exit if a move has been attempted

			if (gameCore.gameOver)
				return

			// This loops through all the nodes and finds the index of atleast one node within 30 to point
			if(gameCore.board.selectedMuon != null){
				//see if the click was near a foci
				gameCore.board.foci.forEach(function(target, index) {
					var x = target.x - point[0],
					    y = target.y - point[1],
					    distance = Math.sqrt(x * x + y * y);
					//check if the node (target) is within the maxdist of the click    
					if (distance < maxFociDist) {
						//move gameCore.board.selectedMuon toward this target (foci)
						gameCore.AttemptMove(gameCore.board.selectedMuon,index);
						exit = true;
					} 
				});
			}

			var closestNode; //used to store the node closest to the click
			var closestPoint = Infinity; //used to compare the distance between closestNode and other nodes
			//loop though all of the nodes
			gameCore.board.nodes.forEach(function(target) {
				var x = target.x - point[0],
				    y = target.y - point[1],
				    distance = Math.sqrt(x * x + y * y);
				//check if the node (target) is within the maxdist of the click    
				if (distance < maxdist) {
					//if target is closer than my currently stored closestNode then replace it with target
					if(closestPoint > distance) {
						closestNode = target;
						closestPoint = distance;
					}
				} else {
					//unselect all other nodes
					target.selected = false;
					gameCore.board.selectedMuon = null;
					gameCore.board.spinningMuon = null;
				}
			});

            if(gameCore.network.roomid != null && closestNode){
                if(gameCore.network.team == gameCore.network.turn){ //my turn
	            	if(closestNode.antimuon == (gameCore.network.team == 'antimuon' ? 1 : 0)){
		                //select all the nodes around the node we clicked
		                var startIndex = closestNode.index - (closestNode.index % 3);
		                gameCore.board.selectedMuon = closestNode.foci;
						var nodesRoundFoci = d3.selectAll(".id" + startIndex + ",.id" + (startIndex + 1) + ",.id" + (startIndex + 2))[0];
						var point = {
							x: (nodesRoundFoci[0].cx.baseVal.value + nodesRoundFoci[1].cx.baseVal.value + nodesRoundFoci[2].cx.baseVal.value) / 3,
							y: (nodesRoundFoci[0].cy.baseVal.value + nodesRoundFoci[1].cy.baseVal.value + nodesRoundFoci[2].cy.baseVal.value) / 3
						};
						var nodesRoundFoci = d3.selectAll(".id" + startIndex + ",.id" + (startIndex + 1) + ",.id" + (startIndex + 2));
						gameCore.board.beginRotatingSelectedMuon(nodesRoundFoci, closestNode.foci, point)		                
                	}
                }
            // PVP game (pass and play)
            } else if (gameCore.pvp.enabled && closestNode) {
            	// Player 1 turn and belongs to them or p2 and belongs to them
            	if ((gameCore.pvp.turn == 1 && gameCore.BelongsToPlayer(gameCore.pvp.p1Pos, closestNode.foci)) || (gameCore.pvp.turn == 2 && gameCore.BelongsToPlayer(gameCore.pvp.p2Pos, closestNode.foci))) {
            		//select all the nodes around the node we clicked
					if(closestNode.foci == gameCore.board.selectedMuon) { 
						//its already spinning so unselect it
						gameCore.board.selectedMuon = null;
					} else {
						var startIndex = closestNode.index - (closestNode.index % 3);
						gameCore.board.selectedMuon = closestNode.foci;
						var nodesRoundFoci = d3.selectAll(".id" + startIndex + ",.id" + (startIndex + 1) + ",.id" + (startIndex + 2))[0];
						var point = {
							x: (nodesRoundFoci[0].cx.baseVal.value + nodesRoundFoci[1].cx.baseVal.value + nodesRoundFoci[2].cx.baseVal.value) / 3,
							y: (nodesRoundFoci[0].cy.baseVal.value + nodesRoundFoci[1].cy.baseVal.value + nodesRoundFoci[2].cy.baseVal.value) / 3
						};
						var nodesRoundFoci = d3.selectAll(".id" + startIndex + ",.id" + (startIndex + 1) + ",.id" + (startIndex + 2));
						gameCore.board.beginRotatingSelectedMuon(nodesRoundFoci, closestNode.foci, point)
					}
            	}
            // Human vs AI game
            } else if (closestNode && gameCore.BelongsToPlayer(gameCore.HUPos, closestNode.foci)) {
				if (gameCore.AITurn)
					return;
				//select all the nodes around the node we clicked
				if(closestNode.foci == gameCore.board.selectedMuon) { 
					//its already spinning so unselect it
					gameCore.board.selectedMuon = null;
				} else {
					var startIndex = closestNode.index - (closestNode.index % 3);
					gameCore.board.selectedMuon = closestNode.foci;
					var nodesRoundFoci = d3.selectAll(".id" + startIndex + ",.id" + (startIndex + 1) + ",.id" + (startIndex + 2))[0];
					var point = {
						x: (nodesRoundFoci[0].cx.baseVal.value + nodesRoundFoci[1].cx.baseVal.value + nodesRoundFoci[2].cx.baseVal.value) / 3,
						y: (nodesRoundFoci[0].cy.baseVal.value + nodesRoundFoci[1].cy.baseVal.value + nodesRoundFoci[2].cy.baseVal.value) / 3
					};
					var nodesRoundFoci = d3.selectAll(".id" + startIndex + ",.id" + (startIndex + 1) + ",.id" + (startIndex + 2));
					gameCore.board.beginRotatingSelectedMuon(nodesRoundFoci, closestNode.foci, point)
				}
			}
		},
        refresh: function(){

		    gameCore.board.activeLinks = gameCore.board.activeLinks.data(gameCore.board.links);
		    gameCore.board.activeLinks.enter().insert("line", ".node")
		      .attr("class", function(d) { return "linkid" + d.linkid + " link" });

		    gameCore.board.activeNodes = gameCore.board.activeNodes.data(gameCore.board.nodes);
		    gameCore.board.activeNodes.enter().append("circle")
		      .attr("class", function(d) { return "id" + d.id + " node" })
		      .attr("cx", function(d) { return d.x; })
		      .attr("cy", function(d) { return d.y; })
		      .attr("r", 10)
		      .style("stroke", function(d) { return (!d.antimuon) ? d3.rgb(85, 165, 55) :  d3.rgb(75, 142, 182); })
		      .attr('fill', function(d){ return (!d.antimuon) ? 'url(#muongradient)' : 'url(#antigradient)';})
		      .call(gameCore.board.d3force.drag)


		    gameCore.board.d3force.start()
		},
		createBoard: function(){
			gameCore.board.boardSVG = d3.select(".gamepieces").append("svg")
				.attr("class", "d3gamepieces")
			    .attr("width", gameCore.board.width)
			    .attr("height", gameCore.board.height)
			    .on("mousedown", gameCore.board.mousedown);

		    var muongradient = gameCore.board.boardSVG.append("svg:defs")
			    .append("svg:radialGradient")
			    .attr("id", "muongradient")
			    .attr("cx", "50%")
			    .attr("cy", "50%")
			    .attr("fx", "50%")
			    .attr("fy", "50%")

			// Define the gradient colors
			muongradient.append("svg:stop")
			    .attr("offset", "10%")
			    .attr("stop-color", d3.rgb(95,173,65).darker(2))
			    .attr("stop-opacity", 0.9);

			muongradient.append("svg:stop")
			    .attr("offset", "100%")
			    .attr("stop-color", "rgb(95,173,65)")
			    .attr("stop-opacity", 1);

			var antimugradient = gameCore.board.boardSVG.append("svg:defs")
			    .append("svg:radialGradient")
			    .attr("id", "antigradient")
			    .attr("cx", "50%")
			    .attr("cy", "50%")
			    .attr("fx", "50%")
			    .attr("fy", "50%")

			// Define the gradient colors
			antimugradient.append("svg:stop")
			    .attr("offset", "10%")
			    .attr("stop-color", d3.rgb(84,144,204).darker(2))
			    .attr("stop-opacity", 0.9);
			antimugradient.append("svg:stop")
			    .attr("offset", "100%")
			    .attr("stop-color", "rgb(84,144,204)")
			    .attr("stop-opacity", 1);    

			gameCore.board.d3force = d3.layout.force()
			    .nodes(gameCore.board.nodes)
			    .links(gameCore.board.links)
			    .linkDistance(50)
			    .linkStrength(1)
			    .gravity(0.0)
			    .charge(function(d, i) { 
			      return d.id % 3 == 0 ? -30 : 0; 
			    })
			    .size([gameCore.board.width, gameCore.board.height])
			    .on("tick", gameCore.board.tick)			    
			    
			gameCore.board.activeNodes = gameCore.board.boardSVG.selectAll("circle");
			gameCore.board.activeLinks = gameCore.board.boardSVG.selectAll('.link');
			gameCore.board.addMuons();
			gameCore.board.addAntiMuons();
		},
		clearBoard: function(){
			if(gameCore.board.d3force != null){
				gameCore.board.d3force.stop();
				d3.select(".d3gamepieces").remove();
			}
			gameCore.board.ready = false;
			gameCore.board.nodes = [];
			gameCore.board.links = [];
			gameCore.board.boardSVG = null;
			gameCore.board.d3force = null;
			gameCore.board.activeNodes = null;
			gameCore.board.activeLinks = null;
			gameCore.board.selectedMuon = null;
			gameCore.AIPos = 0b00000000001111100000; //top left pieces
			gameCore.HUPos = 0b00000111110000000000; //bottom right pieces
			gameCore.playerOneFlag = true;
			gameCore.playerTwoFlag = true;
			gameCore.AITurn = true;
			gameCore.moveHistory = [];
			gameCore.moveCount = 0;
			tutorial.IS_TUTORIAL = false;
			gameCore.gameOver = false;
		},
		addNodeAtFoci: function(f,anti){
		    var i = f * 3

		    gameCore.board.nodes.push({id: i, x:0, y:0, foci: f, antimuon: anti, selected: false, angle: (Math.PI / 2)});
		    gameCore.board.nodes.push({id: i + 1, x:0, y:0, foci: f, antimuon: anti, selected: false, angle: ((7 * Math.PI) / 6)});
		    gameCore.board.links.push({source: i, target: i + 1, linkid: i});
		    gameCore.board.nodes.push({id: i + 2, x:0, y:0, foci: f, antimuon: anti, selected: false, angle: ((11 * Math.PI) / 6)});
		    gameCore.board.links.push({source: i + 2, target: i + 1, linkid: i});
		    gameCore.board.links.push({source: i, target: i + 2, linkid: i});

		    gameCore.board.refresh();
		},
		addMuons: function(){
			gameCore.board.addNodeAtFoci(0,1);
			gameCore.board.addNodeAtFoci(1,1);
			gameCore.board.addNodeAtFoci(2,1);
			gameCore.board.addNodeAtFoci(3,1);
			gameCore.board.addNodeAtFoci(4,1);
		},
		addAntiMuons: function(){
			gameCore.board.addNodeAtFoci(5,0);
			gameCore.board.addNodeAtFoci(6,0);
			gameCore.board.addNodeAtFoci(7,0);
			gameCore.board.addNodeAtFoci(8,0);
			gameCore.board.addNodeAtFoci(9,0);
		},
		moveMuonTweenFoci: function(f1,f2){

        	//stop rotating the muon
			gameCore.board.selectedMuon = null;
			gameCore.board.spinningMuon = null;

			gameCore.board.nodes.forEach(function(o, i) {
				if (o.foci == f1) {o.foci = f2;}
			});

			Audio.playRandomMove();
			
			if(gameCore.network.roomid == null){
				if(BoardGUI.getBoardHeaderText() == 'muon'){
					BoardGUI.setBoardHeader('antimuon');
				} else {
					BoardGUI.setBoardHeader('muon');
				}
			}

			gameCore.board.refresh();
		},
		moveMuonsToWinFoci: function(f1,f2,f3, muon){
			//f1,f2,f3 are the foci to move from
			BoardGUI.hideAllModals();

			// Prevent user from clicking any menu buttons during animation
			document.getElementById("menu-hide").style.zIndex = 2;

			var player = document.getElementById("winAnim");
			if (muon)
			{
				gameCore.finalWinner = 'Muon';
				player.src = "./videos/muonWin.mp4";
			}
			else if (f1 == -1 && f2 == -1 && f3 == -1) // If all foci are equal to zero, it is a draw
			{
				player.src = "./videos/Draw.mp4";
			}
			else
			{
				gameCore.finalWinner = 'Anti-muon';
				player.src = "./videos/antiWin.mp4";
			}

			//fade out board
			var gameboards = _.filter(d3.selectAll('.gameboard')[0], function(d){ return !d.classList.contains('gamepieces')})
			_.each(gameboards, function(g){g.classList.add('fade-out')})

			var finalThree = [];

			//move f1,f2,f3 and fade out other mouns
			gameCore.board.nodes.forEach(function(o, i) {
				if (o.foci == f1) {o.foci = 20; finalThree.push(o.id); return;}
				if (o.foci == f2) {o.foci = 21; finalThree.push(o.id); return;}
				if (o.foci == f3) {o.foci = 22; finalThree.push(o.id); return;}

				//fade out all the other muons
				d3.selectAll('.linkid' + o.id).transition().style('opacity', '0');
				d3.select('.id' + o.id).transition().style('opacity', '0');
			});

			if (f1 != -1 && f2 != -1 && f3 != -1)
			{
				setTimeout(function(){
					_.each(finalThree, function(id){
						d3.selectAll('.linkid' + id).transition().duration(1000).style('opacity', '0');
						d3.select('.id' + id).transition().duration(1000).style('opacity', '0');
					})
				},7000)
			}

			player.play();

			gameCore.board.refresh();
		},
		rotateMuonAtFoci: function(foci) {
			var nodesAtFoci = gameCore.board.getMuonNodesAtFoci(foci);
			var point = {
							x: (nodesAtFoci[0].x + nodesAtFoci[1].x + nodesAtFoci[2].x) / 3,
							y: (nodesAtFoci[0].y + nodesAtFoci[1].y + nodesAtFoci[2].y) / 3
						};
			var nodesOfMuon = d3.selectAll(".id" + nodesAtFoci[0].id + ",.id" + nodesAtFoci[1].id + ",.id" + nodesAtFoci[2].id);
			d3.timer(function(){
        		nodesOfMuon
			    .attr("cx", function(d) {
					if(d.angle>(2*Math.PI)){
						d.angle=0;
					} else if (d.angle < 0){
						d.angle = (2*Math.PI)
					}

					d.x = point.x + gameCore.board.noderadius * Math.cos(d.angle)
					return d.x;
			    })
			    .attr("cy", function(d) {
					d.y = point.y + gameCore.board.noderadius * Math.sin(d.angle)
					return d.y;
			    });
			    
		    
			    nodesOfMuon.each(function(d){
			    	if(!d.antimuon)
			    		d.angle+=0.05;
			    	else 
			    		d.angle -=0.05;
			    })

			    nodesOfMuon
			      .attr("cx", function(d) { return d.x; })
			      .attr("cy", function(d) { return d.y; })

			    gameCore.board.activeLinks
			      .attr("x1", function(d) { return d.source.x; })
			      .attr("y1", function(d) { return d.source.y; })
			      .attr("x2", function(d) { return d.target.x; })
			      .attr("y2", function(d) { return d.target.y; })
	    	});
		},
		getMuonNodesAtFoci: function(foci){
			var result = [];
			gameCore.board.nodes.forEach(function(target) {
				if(target.foci == foci)
					result.push(target);
			});

			return result;
		}
	},
	// Called when the player proposes a draw (ONLY TO THE AI)
	// Draws between networked players are determined if the other accepts
	ProposeDrawToAI: function() {
		draw = false;
		// Will only allow draw possibility if it's the first this turn
		if (!gameCore.attemptedDraw) {
			// Will only have a chance to accept a draw after 40 moves
			if (gameCore.moveCount >= gameCore.MAX_HIST) {
				console.log("Draw probability: " + gameCore.drawProb + "%");
				num = Math.floor(Math.random() * 100) + 1;
				if (num <= gameCore.drawProb){
					draw = true;
					gameCore.winner = "draw";
				}
				gameCore.attemptedDraw = true;
			}
		}
		else {
			console.log("You have already attempted a draw this turn");
		}

		return draw;
	},
	// Determines if the selected node belongs to the current player
	// This is so the player cannot select a piece that is not theirs
	BelongsToPlayer: function(player, selectedNode) {
		node = convert.intToBit(selectedNode);
		return (player & node) > 0;
	},
	// Determines if the move the player wishes to perform is a valid one
	// Assumes that the move is passed in the form of bits
	ValidMove: function(from, to) {
		// Retrieve the positions adjecent to the selectied piece
		var quad = convert.bitToQuad(from);
		var node = convert.bitToNode(from);
		var openPositions = '';
		if(gameCore.network.roomid != null){
			openPositions = gameCore.GetAvailableMoves(from, gameCore.network.opponentPos ^ gameCore.network.localPos ^ 0xFFFFF);
		} else if (gameCore.pvp.enabled) {
			openPositions = gameCore.GetAvailableMoves(from, gameCore.pvp.p1Pos ^ gameCore.pvp.p2Pos ^ 0xFFFFF);
		} else {
			openPositions = gameCore.GetAvailableMoves(from, gameCore.HUPos ^ gameCore.AIPos ^ 0xFFFFF);
		}
		console.log("Open positions: " + gameCore.dec2bin(openPositions));

		// Return if the move selected is adjacent to the selected piece, and free of other pieces.
		return (openPositions & to) > 0;
	},
	// Adds the specified move to the history list.
	AddMoveToHistory: function(move) {
		if (gameCore.moveHistory.length < gameCore.MAX_HIST)
			gameCore.moveHistory.push(move);
		else {
			gameCore.moveHistory.shift();
			gameCore.moveHistory.push(move);
		}

		document.getElementById('moveCount').innerHTML = ++gameCore.moveCount;
	},
	GetAvailableMoves: function(piece, openPositions) {
		var quad = convert.bitToQuad(piece)
		var node = convert.bitToNode(piece)
		return openPositions&evaluation.nodeConnections[quad][node];
	},
	// Moves a piece from one position to another
	// Assumes that the move is passed in the form of 0-19
	AttemptMove:function(from, to){
		var bitFrom = convert.intToBit(from);
		var bitTo = convert.intToBit(to);

		if (gameCore.ValidMove(bitFrom, bitTo)) {
			//is tutoral
			if(tutorial.IS_TUTORIAL){
				gameCore.HUPos ^= bitFrom ^ bitTo;
				gameCore.board.moveMuonTweenFoci(from, to);
				if (tutorial.isFirstMove){
					if(window.location.hash == "#/help3"){
						tutorial.isFirstMove = false;
						tutorial.updateFlagSlide();
					}
				}

				if (evaluation.isHomeQuadEmpty(2, gameCore.HUPos)) {
					BoardGUI.removeMuonFlag();
					if(tutorial.index == 0)
						tutorial.quadCleared();
				}

				if (gameCore.GameOver(gameCore.HUPos)) {
					if(tutorial.index == 1)
						tutorial.tutorialWin();
				}
				
				return;
			}
			
			// PVP pass n play
			if (gameCore.pvp.enabled) {
				console.log("Player " + gameCore.pvp.turn + " moved from " + convert.bitToStandard(bitFrom) + " to " + convert.bitToStandard(bitTo));

				// Player 1 just moved
				if (gameCore.pvp.turn == 1) {
					// Update the user's bit board
					gameCore.pvp.p1Pos ^= bitFrom ^ bitTo;
					gameCore.AddMoveToHistory(new Move(from, to, "player 1"));

					debugger;

					// Remove player flag if home quad abandoned
					if (evaluation.isHomeQuadEmpty(gameCore.pvp.p1Team == 'muon' ? 2 : 1, gameCore.pvp.p1Pos)) {
						gameCore.pvp.p1Flag = false;
						if(gameCore.pvp.p1Team == 'muon')
							BoardGUI.removeMuonFlag();
						else
							BoardGUI.removeAntiMuonFlag();
						console.log("Player 1 can now win from their home quad");
					}
				}
				// Player 2 just moved
				else {
					// Update the user's bit board
					gameCore.pvp.p2Pos ^= bitFrom ^ bitTo;
					gameCore.AddMoveToHistory(new Move(from, to, "player 2"));


					debugger;
					// Remove player flag if home quad abandoned
					if (evaluation.isHomeQuadEmpty(gameCore.pvp.p2Team == 'muon' ? 2 : 1, gameCore.pvp.p2Pos)) {
						gameCore.pvp.p2Flag = false;
						if(gameCore.pvp.p2Team == 'muon')
							BoardGUI.removeMuonFlag();
						else
							BoardGUI.removeAntiMuonFlag();
						console.log("Player 2 can now win from their home quad");
					}
				}

				// Move piece
				gameCore.board.moveMuonTweenFoci(from, to);

				// Check for win
				if (gameCore.pvp.turn == 1 && gameCore.GameOver(gameCore.pvp.p1Pos)) {
					gameCore.pvp.winner = gameCore.pvp.p1Team;
					gameCore.EndGame();
				}
				else if (gameCore.pvp.turn == 2 && gameCore.GameOver(gameCore.pvp.p2Pos)) {
					gameCore.pvp.winner = gameCore.pvp.p2Team;
					gameCore.EndGame();
				}
				else
					gameCore.pvp.turn = gameCore.pvp.turn == 1 ? 2 : 1;

				return;
			}
			// If there is no room ID then you are playing against the AI.
			else if(gameCore.network.roomid == null) {
				console.log("Player moved from " + convert.bitToStandard(bitFrom) + " to " + convert.bitToStandard(bitTo));
				gameCore.attemptedDraw = false;

				// Update the human board
				gameCore.HUPos ^= bitFrom ^ bitTo;
				gameCore.AddMoveToHistory(new Move(from, to, "player"));

				// Remove the human flag if they have abandoned their home quad
				if (evaluation.isHomeQuadEmpty(gameCore.HUPlayerNumber, gameCore.HUPos)) {
					if(gameCore.HUPlayerNumber == 2)
						gameCore.ChangePlayer2Flag(false);
					else
						gameCore.ChangePlayer1Flag(false);
					console.log("Player can now win from their home quad");
				}

				// Increase probability of draw acceptance
				if (gameCore.moveCount >= gameCore.MAX_HIST) {
					gameCore.drawProb++;
				}

				// Update current turn and move piece
				gameCore.AITurn = !gameCore.AITurn; //AIs turn is set to true
				gameCore.board.moveMuonTweenFoci(from, to);
				
				// Check for win and retrieve AI move
				if (gameCore.GameOver(gameCore.HUPos)) {
					gameCore.EndGame();
				}
				else {
					// Make ai move
					gameCore.aiStart = Date.now();
					aiWorker.postMessage({ 'from': bitFrom, 'to': bitTo });
				}
			}
			// If there is a room ID then you are playing over network.
			else if(gameCore.network.turn == gameCore.network.team) { // If it's the the users turn.
				console.log("Player moved from " + convert.bitToStandard(bitFrom) + " to " + convert.bitToStandard(bitTo));
				
				// Update the users bit board.
				gameCore.network.localPos ^= bitFrom ^ bitTo;
				gameCore.AddMoveToHistory(new Move(from, to, "local"));
				gameCore.board.moveMuonTweenFoci(from, to);
				//remove my flag if needed
				if(evaluation.isHomeQuadEmpty((gameCore.network.role == 'host') ? 2 : 1, gameCore.network.localPos)) {
					gameCore.network.localFlag = false;
					if (gameCore.network.role == "host")
					{
						BoardGUI.removeMuonFlag();
					}
					else
					{
						BoardGUI.removeAntiMuonFlag();
					}
					console.log("Player can now win from their home quad");
				}

				cloak.message('turnDone', [from, to, gameCore.network.localPos]);
				if (gameCore.network.CheckForLocalWin(gameCore.network.localPos)) {
					gameCore.network.EndNetworkGame();
				}
			} else {
				console.log("it is not your turn idiot.");
			}
		} else {
			gameCore.board.selectedMuon = null;
			console.log("Player attempted an invalid move, from " + convert.bitToStandard(bitFrom) + " to " + convert.bitToStandard(bitTo));
		}
	},
	// Updates the flag for whether or not player 1 can create triangles in their starting quad
	ChangePlayer1Flag: function(status) {
		gameCore.playerOneFlag = status;
		if(!status){
			BoardGUI.removeAntiMuonFlag();
		}
	},
	// Updates the flag for whether or not player 2 can create triangles in their starting quad
	ChangePlayer2Flag: function(status) {
		gameCore.playerTwoFlag = status;
		if(!status){
			BoardGUI.removeMuonFlag();
		}
	},

	// Determines if the player won
	GameOver: function(position) {
		var player;
		var p1Flag;
		var p2Flag;

		if (gameCore.pvp.enabled) {
			if (position == gameCore.pvp.p1Pos){
				if (gameCore.pvp.p1Team == 'muon')
					player = 2;
				else
					player = 1;
			}
			else {
				if (gameCore.pvp.p2Team == 'muon')
					player = 2;
				else
					player = 1;
			}
			p2Flag = gameCore.pvp.p1Flag;
			p1Flag = gameCore.pvp.p2Flag;
		}
		else {
			if(position == gameCore.AIPos)
				player = gameCore.AIPlayerNumber;
			else
				player = gameCore.HUPlayerNumber;
			p1Flag = gameCore.playerOneFlag;
			p2Flag = gameCore.playerTwoFlag;
		}
		gameCore.board.winningFoci = evaluation.Win(position, player, p1Flag, p2Flag);
		if (gameCore.board.winningFoci) {
			if(gameCore.network.roomid != null)
				gameCore.winner = player == 1 ? "opponent" : "local";
			else {
				gameCore.winner = player == gameCore.AIPlayerNumber ? 'ai' : 'human';
			}
			return true;
		} else {
			return false;
		}
	},

	RestartGame: function(isNetworkGame, role) {
		gameCore.board.clearBoard();
	 	gameCore.board.createBoard();

	 	if(isNetworkGame){
	 		BoardGUI.setBoardHeader(gameCore.network.team);
	 		if(gameCore.network.role == 'host') {
	 			//then i'm the bottom right pieces
	 			gameCore.network.localPos = 0b00000111110000000000;
	 			gameCore.network.localStartPos = 0b00000111110000000000;
	 			//my opponent is up top
	 			gameCore.network.opponentPos = 0b00000000001111100000;
	 			gameCore.network.opponentStartPos = 0b00000000001111100000;
	 		} else if(gameCore.network.role =='client') {
	 			//then i'm the top pieces
	 			gameCore.network.localPos = 0b00000000001111100000;
	 			gameCore.network.localStartPos = 0b00000000001111100000;
	 			//my opponent is below
	 			gameCore.network.opponentPos = 0b00000111110000000000;
	 			gameCore.network.opponentStartPos = 0b00000111110000000000;
	 		}
	 		gameCore.network.localFlag = true;
	 		gameCore.network.opponentFlag = true;
	 		BoardGUI.setBoardHeader(gameCore.network.turn);
	 	} else if (gameCore.pvp.enabled) {
	 		if (gameCore.pvp.p1Team == 'muon') {
	 			gameCore.pvp.p2Team = 'antimuon';
	 			gameCore.pvp.p1Pos = 0b00000111110000000000;
	 			gameCore.pvp.p2Pos = 0b00000000001111100000;
	 		}
	 		else {
	 			gameCore.pvp.p2Team = 'muon';
	 			gameCore.pvp.p1Pos = 0b00000000001111100000;
	 			gameCore.pvp.p2Pos = 0b00000111110000000000;
	 		}

	 		gameCore.pvp.first = gameCore.pvp.p1Team;

	 		gameCore.pvp.p1Flag = true;
	 		gameCore.pvp.p2Flag = true;

	 		//gameCore.pvp.turn = (gameCore.pvp.p1Team == gameCore.pvp.first) ? 1 : 2;
	 		BoardGUI.setBoardHeader((gameCore.pvp.turn == 1) ? gameCore.pvp.p1Team : gameCore.pvp.p2Team);
	 	} else {
	 		gameCore.AITurn = gameCore.AIGoesFirst;

	 		if(gameCore.humanteam == 'muon'){
				gameCore.AIPos = 0b00000000001111100000; //top left pieces AI
				gameCore.AIPlayerNumber = 1;
				gameCore.HUPos = 0b00000111110000000000; //bottom right pieces HUMAN
				gameCore.HUPlayerNumber = 2;
				gameCore.opponentTeam = 'antimuon';
			}
			else{
				gameCore.opponentTeam = 'muon';
				gameCore.HUPos = 0b00000000001111100000; //top left pieces
				gameCore.HUPlayerNumber = 1;
				gameCore.AIPos = 0b00000111110000000000; //bottom right pieces
				gameCore.AIPlayerNumber = 2;
			}

			if(gameCore.AITurn){
	 			BoardGUI.setBoardHeader(gameCore.opponentTeam);
	 		} else {
	 			BoardGUI.setBoardHeader(gameCore.humanteam);
	 		}
			
			gameCore.aiStart = Date.now();
	 		aiWorker.postMessage({ 
				'restart': true,
				'AIStarts': gameCore.AIGoesFirst,
				'depth': gameCore.AITreeDepth,
				'AiStartingPosition': gameCore.humanteam == 'antimuon' ? 'bottom' : 'top'
			});
	 	}

	},
	//EndGame sets the game board to not be able to be interfered with by the player.
	EndGame: function() {
		gameCore.gameOver = true;	// Lock the board from player input
		if (gameCore.pvp.enabled) {
			setTimeout(function(){
				var foci = gameCore.board.winningFoci;
				if(foci){
					if(gameCore.pvp.winner == 'muon')
						gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],true);
					else
						gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],false);
				}

				gameCore.board.gameOverModal = BoardGUI.showWinModal;
			}, 2000);
		}
		else if (gameCore.winner == "local" || gameCore.winner == "human") {
			setTimeout(function(){
				var foci = gameCore.board.winningFoci;
				if(foci){
					if(gameCore.humanteam == 'muon')
						gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],true);
					else
						gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],false);
				}

				gameCore.board.gameOverModal = BoardGUI.showWinModal;
			}, 2000);
		}
		else if (gameCore.winner == "opponent" || gameCore.winner == "ai"){
			setTimeout(function(){
				var foci = gameCore.board.winningFoci;
				if(foci){
					if(gameCore.humanteam == 'muon')
						gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],false);
					else
						gameCore.board.moveMuonsToWinFoci(foci[0],foci[1],foci[2],true);
				}
				gameCore.board.gameOverModal = BoardGUI.showLoseModal;
			}, 2000);
		}
		else{
			console.log("IT'S A DRAW!");
			gameCore.board.moveMuonsToWinFoci(-1,-1,-1,false);
		}
	},
	dec2bin: function(dec) {
    	return dec.toString(2);
	},

	endTutorial: function() {
		// history.pushState({foo: 'bar'}, 'Menu', 'menu.html');
		// history.pushState({foo: 'bar'}, 'Play', 'newgame.html');
	},
	endAnimation: function(){
		var player = document.getElementById("winAnim");
		if (player.currentTime > .1)
		{
			var gameboards = _.filter(d3.selectAll('.gameboard')[0], function(d){ return !d.classList.contains('gamepieces')})
				_.each(gameboards, function(g){g.classList.remove('fade-out')})

			if (gameCore.winner == "local" || gameCore.winner == "human")
			{
				BoardGUI.showWinModal(gameCore.finalWinner + "s Win.");
			}
			else if (gameCore.winner == "opponent" || gameCore.winner == "ai")
			{
				BoardGUI.showLoseModal(gameCore.finalWinner + "s Win.");
			}
			else
			{
				BoardGUI.showDrawModal();
			}
			document.getElementById("menu-hide").style.zIndex = 0;
		}
	}
};

aiWorker.onmessage = function(e) {
	console.log('Message received from worker');
	console.log("AI moved from " + convert.bitToStandard(convert.intToBit(e.data.from)) + " to " + convert.bitToStandard(convert.intToBit(e.data.to)));
	gameCore.attemptedDraw = false;
	
	gameCore.AIPos ^= (convert.intToBit(e.data.from)) ^ (convert.intToBit(e.data.to));
	
	// Don't move the AI piece if less than 3 seconds have passed
	gameCore.aiEnd = Date.now();

	// Delay so the AI stuff doesn't happen immediately and make the player feel weird
	setTimeout(function(){
		gameCore.AddMoveToHistory(new Move(e.data.from, e.data.to, "ai"));
		gameCore.board.moveMuonTweenFoci(e.data.from, e.data.to);
		
		// Remove the flag if they have abandoned their home quad
		if (evaluation.isHomeQuadEmpty(gameCore.AIPlayerNumber, gameCore.AIPos)) {
			if(gameCore.AIPlayerNumber == 2)
				gameCore.ChangePlayer2Flag(false);
			else
				gameCore.ChangePlayer1Flag(false);
			console.log("AI can now win from their home quad");
		}
		
		gameCore.AITurn = false;

		if (gameCore.GameOver(gameCore.AIPos)) {
			gameCore.EndGame();
		}
	}, 2000 - (gameCore.aiEnd - gameCore.aiStart))

	if (gameCore.moveCount >= gameCore.MAX_HIST) {
		gameCore.drawProb++;
	}
};