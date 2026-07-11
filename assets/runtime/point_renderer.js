    "use strict";
    (() => {
      const VERTEX_SHADER = `#version 300 es
        precision highp float;
        layout(location=0) in vec3 aPosition;
        layout(location=1) in vec4 aStyle;
        layout(location=2) in float aPackageIndex;
        uniform vec4 uCamera;
        uniform vec4 uViewport;
        uniform vec4 uScene;
        uniform vec3 uVisibility;
        uniform vec4 uState;
        uniform vec3 uExpandedAnchor;
        uniform vec3 uBounds;
        out vec4 vColour;
        out float vDetail;
        out float vSelected;
        void main() {
          vec3 position=aPosition;
          if(uState.y>=0.0 && abs(aPackageIndex-uState.y)<0.5) position=uExpandedAnchor+(position-uExpandedAnchor)*2.35;
          float cy=uCamera.x, sy=uCamera.y, cp=uCamera.z, sp=uCamera.w;
          float x1=position.x*cy-position.z*sy;
          float z1=position.x*sy+position.z*cy;
          float y2=position.y*cp-z1*sp;
          float z2=position.y*sp+z1*cp;
          float depth=270.0-z2;
          if(depth<=35.0){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;vColour=vec4(0.0);vDetail=0.0;vSelected=0.0;return;}
          float perspective=440.0/depth*uScene.z;
          vec2 screen=uScene.xy+vec2(x1,y2)*perspective;
          screen += uViewport.zw;
          if(screen.x<0.0||screen.x>uBounds.x||screen.y<0.0||screen.y>uBounds.y){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;vColour=vec4(0.0);vDetail=0.0;vSelected=0.0;return;}
          vec2 clip=vec2(screen.x/uViewport.x*2.0-1.0, 1.0-screen.y/uViewport.y*2.0);
          float category=aStyle.z;
          float visible=category<0.5?uVisibility.x:(category<1.5?uVisibility.y:uVisibility.z);
          float selected=abs(float(gl_VertexID)-uState.z)<0.5?1.0:0.0;
          float emphasis=uState.y>=0.0?(abs(aPackageIndex-uState.y)<0.5?1.0:0.75):(uState.w>0.5?(selected>0.5?1.0:0.75):(uState.x>=0.0&&abs(category-uState.x)>0.5?0.16:1.0));
          gl_Position=vec4(clip,0.0,1.0);
          float hub=aStyle.w;
          float size=clamp(aStyle.x*(0.62+aStyle.y*0.46)*perspective,0.35,hub>0.5?5.2:3.2);
          gl_PointSize=(selected>0.5?max(18.0,size*10.0):(size<0.85?1.0:size*3.4))*uBounds.z;
          vec3 colour=category<0.5?vec3(244,82,132):(category<1.5?vec3(87,204,255):vec3(255,184,77));
          float alpha=clamp(0.14+aStyle.y*0.105,0.12,hub>0.5?0.86:0.7)*visible*emphasis;
          vColour=vec4(colour/255.0,alpha);
          vDetail=size;
          vSelected=selected;
        }`;
      const FRAGMENT_SHADER = `#version 300 es
        precision highp float;
        in vec4 vColour;
        in float vDetail;
        in float vSelected;
        out vec4 colour;
        void main() {
          float distance=length(gl_PointCoord-vec2(0.5))*2.0;
          if(distance>1.0) discard;
          if(vSelected>0.5 && ((distance>0.45&&distance<0.54)||(distance>0.78&&distance<0.86))){colour=distance<0.6?vec4(1.0):vec4(vColour.rgb,.72);return;}
          float core=smoothstep(1.0,0.0,distance);
          float glow=smoothstep(1.0,0.15,distance)*0.25;
          float white=smoothstep(0.28,0.0,distance)*step(1.1,vDetail);
          colour=vec4(mix(vColour.rgb,vec3(1.0,0.97,0.95),white),vColour.a*(core+glow));
        }`;

      function compile(gl, type, source) {
        const shader=gl.createShader(type);
        gl.shaderSource(shader,source); gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      }

      class WebGLPointRenderer {
        constructor(canvas) {
          this.canvas=canvas;
          this.gl=canvas.getContext("webgl2",{alpha:false,antialias:false,preserveDrawingBuffer:false});
          if(!this.gl) throw new Error("WebGL2 unavailable");
          this.initializeResources();
          this.count=0; this.kind="webgl2";
          canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();this.lost=true;canvas.dispatchEvent(new CustomEvent("rubylensrendererfailure",{detail:"WebGL context lost"}));});
          canvas.addEventListener("webglcontextrestored",()=>{try{this.lost=false;this.initializeResources();if(this.points)this.sync(this.points);}catch(error){canvas.dispatchEvent(new CustomEvent("rubylensrendererfailure",{detail:String(error&&error.message||error)}));}});
        }
        initializeResources() {
          const gl=this.gl, program=gl.createProgram();
          gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,VERTEX_SHADER));
          gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,FRAGMENT_SHADER));
          gl.linkProgram(program);
          if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
          this.program=program; this.buffer=gl.createBuffer();
          this.locations={camera:gl.getUniformLocation(program,"uCamera"),viewport:gl.getUniformLocation(program,"uViewport"),scene:gl.getUniformLocation(program,"uScene"),visibility:gl.getUniformLocation(program,"uVisibility"),state:gl.getUniformLocation(program,"uState"),expandedAnchor:gl.getUniformLocation(program,"uExpandedAnchor"),bounds:gl.getUniformLocation(program,"uBounds")};
        }
        sync(points) {
          const data=new Float32Array(points.length*8);
          const pointIndexes=new Map();
          points.forEach((point,index)=>{
            pointIndexes.set(point,index);
            const offset=index*8, category=point.category==="core"?0:point.category==="tests"?1:2;
            data.set([point.position[0],point.position[1],point.position[2],point.base,point.signal,category,point.hub?1:0,point.packageIndex??-1],offset);
          });
          const started=performance.now();
          const gl=this.gl; gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
          this.points=points; this.pointIndexes=pointIndexes; this.count=points.length; this.needsSync=false; this.uploadMilliseconds=performance.now()-started;
          return this.uploadMilliseconds;
        }
        resize(width,height,dpr) { this.gl.viewport(0,0,Math.round(width*dpr),Math.round(height*dpr)); }
        draw(frame) {
          if(this.lost) return false;
          if(this.needsSync&&this.points) this.sync(this.points);
          const gl=this.gl; gl.clearColor(5/255,3/255,10/255,1); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE); gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
          gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);
          gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,12);
          gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,1,gl.FLOAT,false,32,28);
          gl.uniform4fv(this.locations.camera,frame.matrix);
          gl.uniform4f(this.locations.viewport,frame.width,frame.height,frame.panX,frame.panY);
          gl.uniform4f(this.locations.scene,frame.sceneCenterX,frame.sceneCenterY,frame.zoom,0);
          gl.uniform3f(this.locations.visibility,frame.visibleCategories.core?1:0,frame.visibleCategories.tests?1:0,frame.visibleCategories.dependencies?1:0);
          const focus=frame.focusedCategory==="core"?0:frame.focusedCategory==="tests"?1:frame.focusedCategory==="dependencies"?2:-1;
          const selectedIndex=frame.selectedPoint?(this.pointIndexes.get(frame.selectedPoint)??-1):-1;
          gl.uniform4f(this.locations.state,focus,frame.expandedPackageIndex??-1,selectedIndex,frame.selectionLocked?1:0);
          gl.uniform3fv(this.locations.expandedAnchor,frame.expandedAnchor||[0,0,0]);
          gl.uniform3f(this.locations.bounds,frame.sceneRight,frame.sceneBottom,frame.dpr);
          gl.drawArrays(gl.POINTS,0,this.count); return true;
        }
        info() { const gl=this.gl, ext=gl.getExtension("WEBGL_debug_renderer_info"); return {kind:this.kind,vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),uploadMilliseconds:this.uploadMilliseconds||0}; }
        loseContextForDebug() { this.gl.getExtension("WEBGL_lose_context")?.loseContext(); }
      }

      window.RubyLensPointRenderer=Object.freeze({
        create(canvas,{forceCanvas=false}={}) {
          if(forceCanvas) return {kind:"canvas2d",canvas,error:null};
          try { const renderer=new WebGLPointRenderer(canvas); return {kind:renderer.kind,canvas,renderer,error:null}; }
          catch(error) { return {kind:"canvas2d",canvas,error:String(error&&error.message||error)}; }
        },
      });
    })();
