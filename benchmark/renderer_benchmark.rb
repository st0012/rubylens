# frozen_string_literal: true

require "fileutils"
require "ferrum"
require "json"
require "open3"
require "time"

root = File.expand_path("..", __dir__)
output = File.expand_path(ENV.fetch("OUTPUT", File.join(root, "tmp", "renderer-benchmark", Time.now.utc.strftime("%Y%m%dT%H%M%SZ"))))
frames = Integer(ENV.fetch("FRAMES", "600"))
counts = ENV.fetch("COUNTS", "25000,50000,100000,250000").split(",").map { |value| Integer(value) }
modes = ENV.fetch("MODES", "webgl2").split(",")
browser_path = ENV["BROWSER_PATH"]
FileUtils.mkdir_p(output, mode: 0o700)

runtime = File.read(File.join(root, "assets/runtime/point_renderer.js"))
harness = <<~JAVASCRIPT
  const params = new URLSearchParams(location.search);
  const pointCount = Number(params.get("points"));
  const frameCount = Number(params.get("frames"));
  const mode = params.get("mode") || "webgl2";
  const canvas = document.querySelector("canvas");
  canvas.width = 1440; canvas.height = 900;
  const categoryNames = ["core", "tests", "dependencies"];
  function hash(value) { value=Math.imul(value^(value>>>16),0x21f0aaad); value=Math.imul(value^(value>>>15),0x735a2d97); return (value^(value>>>15))>>>0; }
  const points = Array.from({length:pointCount},(_,index)=>{
    const seed=hash(index+1), dense=index<pointCount*.35, radius=dense?12+(seed%900)/100:25+(seed%12000)/100;
    const angle=(hash(seed+7)/4294967296)*Math.PI*2;
    return {position:[Math.cos(angle)*radius,((hash(seed+11)%4000)/1000-2)*(dense?2:7),Math.sin(angle)*radius],base:index%997===0?1.8:.55+(seed%40)/100,signal:.2+(hash(seed+19)%700)/1000,category:categoryNames[index%3],hub:index%997===0};
  });
  const interactive = points.slice(0, Math.min(512, points.length));
  class CanvasBenchmarkRenderer {
    constructor(canvas){this.context=canvas.getContext("2d",{alpha:false});this.kind="canvas2d";}
    sync(points){this.points=points;return 0;}
    resize(){}
    draw(frame){const c=this.context,m=frame.matrix;c.globalCompositeOperation="source-over";c.fillStyle="#03040a";c.fillRect(0,0,1440,900);c.globalCompositeOperation="lighter";for(const point of this.points){const [x,y,z]=point.position,x1=x*m[0]-z*m[1],z1=x*m[1]+z*m[0],y2=y*m[2]-z1*m[3],depth=270-(y*m[3]+z1*m[2]);if(depth<=35)continue;const perspective=440/depth*1.05,sx=720+x1*perspective,sy=477+y2*perspective;if(sx<0||sx>1440||sy<0||sy>900)continue;c.fillStyle=point.category==="core"?"rgba(244,82,132,.35)":point.category==="tests"?"rgba(87,204,255,.35)":"rgba(255,184,77,.35)";c.fillRect(sx,sy,1,1);}}
    info(){return {kind:this.kind};}
  }
  const selection = mode==="canvas2d"?{renderer:new CanvasBenchmarkRenderer(canvas)}:RubyLensPointRenderer.create(canvas);
  if (!selection.renderer) throw new Error(selection.error || "renderer unavailable");
  const renderer=selection.renderer;
  const uploadMilliseconds=renderer.sync(points);
  renderer.resize(1440,900,1);
  const frameTimes=[], renderWorkTimes=[], cpuProjectionTimes=[];
  let cpuProjectedPoints=0, index=0, previous=performance.now();
  function cpuProject(matrix,zoom) {
    const started=performance.now(); let count=0;
    for(const point of interactive){ const [x,y,z]=point.position; const x1=x*matrix[0]-z*matrix[1]; const z1=x*matrix[1]+z*matrix[0]; const y2=y*matrix[2]-z1*matrix[3]; const depth=270-(y*matrix[3]+z1*matrix[2]); if(depth>35){void (720+x1*440/depth*zoom);void (450+y2*440/depth*zoom);} count++; }
    cpuProjectedPoints=count; cpuProjectionTimes.push(performance.now()-started);
  }
  function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];}
  function tick(now){
    if(index>0) frameTimes.push(now-previous); previous=now;
    const phase=index/Math.max(1,frameCount)*Math.PI*2, yaw=-.36+phase, pitch=.4+Math.sin(phase)*.09;
    const matrix=[Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch)];
    const workStarted=performance.now(); cpuProject(matrix,1.05);
    renderer.draw({matrix,width:1440,height:900,dpr:1,sceneRight:1440,sceneBottom:900,panX:0,panY:0,sceneCenterX:720,sceneCenterY:477,zoom:1.05,visibleCategories:{core:true,tests:true,dependencies:true}});
    renderWorkTimes.push(performance.now()-workStarted);
    index++;
    if(index<=frameCount) requestAnimationFrame(tick); else {
      const measured=frameTimes.slice(Math.min(30,Math.floor(frameTimes.length/10)));
      window.benchmarkResult={mode,pointCount,requestedFrameCount:frameCount,measuredFrameCount:measured.length,medianFrameMilliseconds:percentile(measured,.5),p95FrameMilliseconds:percentile(measured,.95),medianCpuSubmitMilliseconds:percentile(renderWorkTimes,.5),p95CpuSubmitMilliseconds:percentile(renderWorkTimes,.95),framesOver16_7:measured.filter(v=>v>16.7).length,framesOver33_3:measured.filter(v=>v>33.3).length,droppedFrameRatio:measured.filter(v=>v>25.05).length/measured.length,uploadMilliseconds,cpuProjectedPoints:mode==="canvas2d"?pointCount:cpuProjectedPoints,medianCpuProjectionMilliseconds:percentile(cpuProjectionTimes,.5),renderer:renderer.info()};
      document.documentElement.dataset.ready="true";
    }
  }
  requestAnimationFrame(tick);
JAVASCRIPT

html = File.join(output, "benchmark.html")
File.write(html, <<~HTML)
  <!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
  <style>html,body,canvas{margin:0;width:1440px;height:900px;background:#03040a}</style><canvas></canvas><script>#{runtime}\n#{harness}</script>
HTML
File.chmod(0o600, html)

options = {headless: true, timeout: 120, window_size: [1440, 900], browser_options: {"no-sandbox": nil, "disable-background-timer-throttling": nil}}
options[:browser_path] = File.expand_path(browser_path) if browser_path
browser = nil
begin
  browser = Ferrum::Browser.new(**options)
  results = modes.product(counts).map do |mode, count|
    browser.go_to("file://#{html}?points=#{count}&frames=#{frames}&mode=#{mode}")
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 120
    until browser.evaluate('document.documentElement.dataset.ready === "true"')
      raise "benchmark timed out at #{count} points" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.05
    end
    result = browser.evaluate("window.benchmarkResult")
    raise "100k WebGL CPU projection is not bounded" if mode == "webgl2" && count == 100_000 && result.fetch("cpuProjectedPoints") > 512
    browser.screenshot(path: File.join(output, "#{mode}-#{count}.png"), full: false)
    result
  end
  os, = Open3.capture2("sw_vers", "-productVersion")
  memory, = Open3.capture2("sysctl", "-n", "hw.memsize")
  metadata = {recordedAt: Time.now.utc.iso8601, browser: browser.evaluate("navigator.userAgent"), browserExecutable: browser_path && File.expand_path(browser_path), platform: browser.evaluate("navigator.platform"), os: "macOS #{os.strip}", memoryBytes: Integer(memory), device: "Apple M4 MacBook Air", viewport: [1440, 900], dpr: browser.evaluate("devicePixelRatio"), definitions: {framesOver16_7: "RAF intervals over 16.7ms; includes display timer quantization", framesOver33_3: "RAF intervals over 33.3ms", droppedFrameRatio: "RAF intervals over 25.05ms divided by measured frames", cpuSubmitMilliseconds: "CPU command submission only; GPU completion is represented by RAF cadence"}, results:}
  results_path = File.join(output, "results.json")
  File.write(results_path, JSON.pretty_generate(metadata))
  File.chmod(0o600, results_path)
  puts JSON.generate(output:, results:)
ensure
  browser&.quit
end
