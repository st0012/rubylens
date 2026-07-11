# frozen_string_literal: true

require "ferrum"
require "fileutils"
require "json"
require "time"

report = File.expand_path(ARGV.fetch(0))
output = File.expand_path(ARGV.fetch(1, File.join(File.dirname(report), "proof-#{Time.now.utc.strftime('%Y%m%dT%H%M%SZ')}")))
FileUtils.mkdir_p(output, mode: 0o700)
browser_options = {"no-sandbox": nil}
browser_options["force-device-scale-factor"] = ENV["DPR"] if ENV["DPR"]
options = {headless: true, timeout: 30, window_size: [1440, 900], browser_options:}
options[:browser_path] = File.expand_path(ENV["BROWSER_PATH"]) if ENV["BROWSER_PATH"]
browser = nil
begin
  browser = Ferrum::Browser.new(**options)
  evidence = {"environment" => {"devicePixelRatio" => browser.evaluate("devicePixelRatio"), "viewport" => browser.evaluate("[innerWidth,innerHeight]")}}
  {"webgl" => "", "canvas-fallback" => "?renderer=canvas"}.each do |name, query|
    browser.go_to("file://#{report}#{query}")
    browser.refresh if name == "canvas-fallback"
    sleep 1
    sample = browser.evaluate("window.RubyLensRendererDebug.sample()")
    if sample
      browser.evaluate("(()=>{const p=#{JSON.generate(sample)};return document.getElementById('cosmos').dispatchEvent(new PointerEvent('pointermove',{clientX:p.x,clientY:p.y,pointerType:'mouse'}));})()")
      sleep 0.2
    end
    browser.screenshot(path: File.join(output, "#{name}-hover.png"), full: false)
    evidence[name] = {info: browser.evaluate("window.RubyLensRendererDebug.info()"), metrics: browser.evaluate("window.RubyLensRendererDebug.metrics()"), sample:}
    next unless name == "webgl"
    browser.evaluate("window.RubyLensRendererDebug.selectSample()")
    browser.screenshot(path: File.join(output, "webgl-locked-selection.png"), full: false)
    browser.evaluate("window.RubyLensRendererDebug.focusCategory('core')")
    sleep 1
    browser.screenshot(path: File.join(output, "webgl-category-focus.png"), full: false)
    browser.evaluate("window.RubyLensRendererDebug.expandSamplePackage()")
    sleep 1
    browser.screenshot(path: File.join(output, "webgl-expanded-package.png"), full: false)
  end
  {"webgl" => "", "canvas" => "&renderer=canvas"}.each do |name, renderer_query|
    browser.go_to("file://#{report}?capture=1#{renderer_query}")
    browser.evaluate("window.RubyLensCapture.renderFrame(7, 24)")
    browser.screenshot(path: File.join(output, "capture-#{name}-frame-7.png"), full: false)
    evidence["capture-#{name}"] = {info: browser.evaluate("window.RubyLensCapture.renderer()"), metrics: browser.evaluate("window.RubyLensCapture.metrics()"), capture: browser.evaluate("({renderedPoints:window.RubyLensCapture.renderedPoints,totalPoints:window.RubyLensCapture.totalPoints})")}
  end
  browser.go_to("file://#{report}")
  sleep 0.5
  browser.evaluate("window.RubyLensRendererDebug.loseContext()")
  sleep 1
  browser.screenshot(path: File.join(output, "context-loss-canvas-fallback.png"), full: false)
  evidence["context-loss"] = {url: browser.url, info: browser.evaluate("window.RubyLensRendererDebug.info()")}
  path = File.join(output, "proof.json")
  File.write(path, JSON.pretty_generate(evidence)); File.chmod(0o600, path)
  puts JSON.generate(output:, evidence:)
ensure
  browser&.quit
end
