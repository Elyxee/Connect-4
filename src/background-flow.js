// A continuously warped colour field: no image fades or opacity animation.
(() => {
  const canvas = document.getElementById('backgroundFlow');
  if (!canvas) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let gl, program, timeUniform, sizeUniform, frame = 0, elapsed = 0, previous = 0;
  const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
  const fragment = `precision highp float;
    uniform vec2 resolution; uniform float time;
    float blob(vec2 p, vec2 c, float spread){vec2 d=p-c;return exp(-dot(d,d)*spread);}
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution; uv.y=1.-uv.y;
      float t=time*.44;
      // Two travelling waves bend the boundaries, rather than sliding a flat image.
      vec2 q=uv;
      q+=.18*vec2(sin(uv.y*5.2-t*1.1)+.45*sin(uv.x*4.+t*.8),
                       cos(uv.x*4.7+t*.9)+.4*sin(uv.y*6.-t*.7));
      q+=.065*vec2(sin(q.y*9.+t),cos(q.x*8.-t*.8));
      vec2 blue=vec2(.73+.3*sin(t*.81),.20+.24*cos(t*.69));
      vec2 pink=vec2(.16+.25*cos(t*.73+1.2),.78+.23*sin(t*.86));
      vec2 purple=vec2(.84+.25*sin(t*.67+1.),.87+.24*cos(t*.91));
      vec2 cyan=vec2(.59+.37*cos(t*.62),.34+.3*sin(t*.74+2.));
      vec2 cream=vec2(.28+.30*sin(t*.59-.5),.25+.28*cos(t*.77+1.));
      float a=blob(q,blue,7.5),b=blob(q,pink,8.),c=blob(q,purple,7.5);
      float d=blob(q,cyan,12.)*.65,e=blob(q,cream,6.5)*1.8;
      vec3 color=(a*vec3(.16,.51,1.)+b*vec3(1.,.38,.72)+c*vec3(.57,.23,.94)
                  +d*vec3(.40,.89,.98)+e*vec3(1.,.975,.91))/(a+b+c+d+e);
      // Fine stationary grain stays sharp; motion belongs only to the colour field.
      float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
      gl_FragColor=vec4(clamp(color+grain*.024,0.,1.),1.);
    }`;
  function compile(type, source) {
    const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function initialize() {
    try {
      gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
      if(!gl) return;
      program=gl.createProgram();
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      timeUniform=gl.getUniformLocation(program,'time');sizeUniform=gl.getUniformLocation(program,'resolution');
      canvas.dataset.renderer='webgl'; resize();sync();
    } catch(error) {
      canvas.dataset.renderer='fallback'; canvas.style.display='none';
      console.warn('Background uses the static fallback:',error.message);
    }
  }
  function render() {
    if(!program||gl.isContextLost())return;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform2f(sizeUniform,canvas.width,canvas.height);gl.uniform1f(timeUniform,elapsed);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function resize(){
    const {width,height}=canvas.getBoundingClientRect();
    if(!width||!height)return;
    const scale=Math.min(devicePixelRatio||1,2,Math.sqrt(2500000/(width*height)));
    canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);render();
  }
  function tick(now){
    frame=requestAnimationFrame(tick);
    if(now-previous<1000/30)return;
    if(previous)elapsed+=Math.min((now-previous)/1000,.1);
    previous=now;render();
  }
  function sync(){
    cancelAnimationFrame(frame);frame=0;previous=0;
    if(!program||gl.isContextLost())return;
    const running=!document.hidden&&document.body.dataset.screen==='game'&&!reduce.matches;
    canvas.dataset.motion=running?'running':'paused';
    render();if(running)frame=requestAnimationFrame(tick);
  }
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);program=null;});
  canvas.addEventListener('webglcontextrestored',initialize);
  document.addEventListener('visibilitychange',sync);window.addEventListener('pageshow',sync);
  reduce.addEventListener('change',sync);
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
  new ResizeObserver(resize).observe(canvas);
  initialize();
})();
