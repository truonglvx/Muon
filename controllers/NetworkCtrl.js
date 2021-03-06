muonApp.controller('NetworkCtrl', function ($scope, $stateParams) {

	if(!Network.isConnected)
		cloak.run('http://162.243.116.44:8090');
		//cloak.run(packjson.serverurl);

	$scope.$on('$viewContentLoaded', function(){

		setTimeout(function(){ 
			cloak.message('registerUsername', {'username' : Network.username, 'userid' : Network.userId})
		}, 2000);
	});

	$scope.mouse_click = function() {
		if(Audio.togglesound)
			Audio.menuSelect.play();
	}

	
	$scope.refresh = function(){
		cloak.message('listUsers');
		cloak.message('listRooms');
	}

	$scope.createRoom = function(){
		cloak.message('createRoom', {
	      name: escape(Network.username + "'s Game")
	    });
	}

	$scope.joinRoom = function(id){
		console.log("attempting to join room");
		cloak.message('joinRoom', id);
	}
});