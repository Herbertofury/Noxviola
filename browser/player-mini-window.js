'use strict';
const widget=window.createMiniPlayer(document.getElementById('floating-player'),(action,value)=>window.miniPlayer.command(action,value),true);
window.miniPlayer.onState(data=>widget.update(data));
