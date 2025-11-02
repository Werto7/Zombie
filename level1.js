//level1.js
//Defines the level as a global object "level1".
//tile: 0=Empty, 1=Floor, 2=Platform, 3=Wall

window.level1 = {
  width: 60,
  height: 12,
  tiles: (function(){
    //Simple generation: empty rows + bottom
    const W = 60, H = 12;
    const arr = new Array(H).fill(0).map(()=>new Array(W).fill(0));
    //Floor
    for(let x=0;x<W;x++){
      arr[H-1][x] = 1;
      if(x % 6 === 0) arr[H-2][x] = 2; //Isolated platforms
    }
    //Small gaps and platforms
    for(let i=10;i<W;i+=18){
      arr[H-1][i] = 0;
      arr[H-2][i+3] = 2;
      arr[H-3][i+6] = 2;
    }
    //A few walls
    for(let x=28;x<32;x++) arr[H-3][x] = 3;
    return arr;
  })(),
  playerStart: { x: 2, y: 9 } //Tile coordinates (x,y) – y: 0=above
};