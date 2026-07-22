# frozen_string_literal: true

require "base64"
require "open3"
require_relative "test_helper"

class ReportWriterTest < Minitest::Test
  def test_direct_require_exposes_malformed_asset_errors
    Dir.mktmpdir("rubylens-report-assets-") do |directory|
      shell = File.join(directory, "report.html")
      stylesheet = File.join(directory, "report.css")
      runtime = File.join(directory, "report.js")
      File.write(shell, "{{REPORT_RUNTIME}}")
      File.write(stylesheet, "body {}")
      File.write(runtime, '"use strict";')
      lib = File.expand_path("../lib", __dir__)
      script = <<~'RUBY'
        require "rubylens/report_writer"
        RubyLens::ReportWriter.new
        assembler = RubyLens::ReportAssetAssembler.new(
          shell_path: ARGV[0], stylesheet_path: ARGV[1], runtime_path: ARGV[2]
        )
        begin
          assembler.assemble
        rescue RubyLens::Error => error
          puts error.message
        else
          abort "expected RubyLens::Error"
        end
      RUBY

      output, error, status = Open3.capture3(
        RbConfig.ruby, "-I#{lib}", "-e", script, shell, stylesheet, runtime
      )

      assert(status.success?, error)
      assert_equal(
        "report shell must contain exactly one {{REPORT_STYLES}} placeholder\n",
        output
      )
    end
  end

  def test_embeds_the_model_in_an_assembled_template
    assembler = Object.new
    assembler.define_singleton_method(:assemble) do
      '<meta name="generator" content="RubyLens"><script>JSON.parse(atob("{{MODEL_BASE64}}"))</script>'
    end

    Dir.mktmpdir("rubylens-report-") do |directory|
      output = File.join(directory, "report.html")
      model = { "projectName" => "Demo" }

      RubyLens::ReportWriter.new(asset_assembler: assembler).write(model, output: output)

      encoded = File.read(output).match(/atob\("([A-Za-z0-9+\/=]+)"\)/).captures.first
      assert_equal(model, JSON.parse(Base64.strict_decode64(encoded)))
    end
  end

  def test_requires_exactly_one_model_placeholder
    templates = ["<html></html>", "{{MODEL_BASE64}}{{MODEL_BASE64}}"]

    templates.each_with_index do |template, index|
      assembler = Object.new
      assembler.define_singleton_method(:assemble) { template }

      Dir.mktmpdir("rubylens-report-") do |directory|
        output = File.join(directory, "report-#{index}.html")
        error = assert_raises(RubyLens::Error) do
          RubyLens::ReportWriter.new(asset_assembler: assembler).write({}, output: output)
        end

        assert_equal(
          "report template must contain exactly one {{MODEL_BASE64}} placeholder",
          error.message
        )
        refute_path_exists(output)
      end
    end
  end

  def test_writes_an_offline_owner_only_report_and_protects_default_directory
    Dir.mktmpdir("rubylens-report-") do |directory|
      output = File.join(directory, ".rubylens", "report.html")
      model = { "schema" => "rubylens.art.v7", "projectName" => "Demo", "totals" => { "namespaces" => 2 } }

      RubyLens::ReportWriter.new.write(model, output: output)

      html = File.read(output)
      encoded = html.match(/atob\("([A-Za-z0-9+\/=]+)"\)/).captures.first
      assert_equal(model, JSON.parse(Base64.strict_decode64(encoded)))
      assert_includes(html, "connect-src 'none'")
      assert(RubyLens::ArtifactMarker.present?(output, RubyLens::ReportWriter::MARKER))
      assert_includes(html, "RubyLens · Explorer")
      assert_includes(html, "Explore this codebase")
      assert_includes(html, 'const rubyMetricLabels = ["Classes", "Modules", "Methods", "Constants"]')
      assert_includes(html, "const dependencyRubyCounts")
      assert_includes(html, "function createRubyBreakdown")
      assert_includes(html, "function populateWarningDisclosure")
      assert_includes(html, "warning.name")
      assert_includes(html, "warning.reason")
      assert_includes(html, "const testRubyMetricIndexes = [0, 2]")
      assert_includes(html, "function addCoreTooltipMetrics")
      assert_includes(html, "instanceVariableCount: row[13] || 0")
      assert_includes(html, 'addTooltipMetric("Ancestors", point.values[0])')
      assert_includes(html, 'addTooltipMetric("Descendants", point.values[3])')
      assert_includes(html, 'if (point.kind === "Class") addTooltipMetric("Instance variables", point.instanceVariableCount)')
      assert_includes(html, 'addTooltipMetric("References", point.values[4])')
      assert_includes(html, 'if (point.category === "core") addCoreTooltipMetrics(point)')
      assert_includes(html, "Most methods")
      assert_includes(html, "Most constants")
      assert_includes(html, 'Focus ${meta.title}')
      assert_includes(html, 'new Set(["Object", "Kernel", "BasicObject"])')
      assert_includes(html, 'aria-label="Pan mode"')
      assert_includes(html, "function zoomBetween")
      assert_includes(html, "Shift-drag or Pan mode to move")
      assert_includes(html, "function focusDependencyPackage")
      assert_includes(html, "function focusDependencySystem")
      assert_includes(html, "cameraFlight = null")
      assert_includes(html, "function contextualSelectionCameraTarget")
      assert_includes(html, "function flyCamera")
      assert_includes(html, "function updateCameraFlight")
      assert_includes(html, "function advanceExplorerDrift")
      assert_includes(html, "function cancelCameraFlight")
      assert_includes(html, "function cancelPendingHover")
      assert_includes(html, "function completeCameraFlight")
      assert_includes(html, "function render(timestamp)")
      assert_includes(html, "Math.atan2(Math.sin(target.yaw - yaw), Math.cos(target.yaw - yaw))")
      assert_includes(html, "Math.exp(Math.log(start.zoom)")
      assert_includes(html, "angularDistance < .001 && zoomStops < .01 && panDistance < .5")
      assert_includes(html, "if (reducedMotionQuery.matches)")
      assert_includes(html, "if (cameraFlight || driftAdvanced) requestRender()")
      assert_includes(html, "if (cameraFlight || dragging || pointers.size > 0) return")
      assert_includes(html, "const TOP_DOWN_PITCH = Math.PI / 2")
      assert_includes(html, "function navigateToSelection")
      assert_includes(html, "Math.PI - Math.atan2(z, x)")
      assert_includes(html, "const targetPitch = pitch >= 0 ? TOP_DOWN_PITCH : -TOP_DOWN_PITCH")
      assert_includes(html, "panX: sceneRight * .5 + actualSeparation * .5 - sceneCenterX")
      assert_includes(html, "flyCamera(contextualSelectionCameraTarget(point), { followDrift: true })")
      assert_includes(html, "navigateToSelection(hub, { button, expandDependency: true })")
      assert_includes(html, "if (cameraFlight || !point?.screen)")
      assert_includes(html, 'canvas.setAttribute("aria-busy", "true")')
      assert_includes(html, "Double-click a dependency system or gem cloud, press Enter")
      assert_includes(html, "press Enter or F on its selected marker")
      assert_includes(html, 'aria-keyshortcuts="Space"')
      assert_includes(html, 'id="reset-view" aria-label="Reset to default view"')
      assert_includes(html, "Expanded gem cloud")
      assert_includes(html, "if (event.metaKey || event.ctrlKey || event.altKey) return")
      assert_includes(html, "const interactivePoints = []")
      assert_includes(html, "if (interactive && interactiveMode) interactivePoints.push(point)")
      assert_includes(html, 'const RSPEC_PROXY_PREFIX = "RSpec example group #"')
      assert_includes(html, "const interactive = interactiveMode && !name.startsWith(RSPEC_PROXY_PREFIX)")
      assert_includes(html, "if (interactiveMode) Object.assign(point")
      assert_includes(html, "model.dependencyStars = []")
      assert_includes(html, "function hoverTargetAt")
      assert_includes(html, "function dependencyPackageAt(x, y, exact = hitTest(x, y))")
      assert_includes(html, "return exact || dependencyPackageAt(x, y, exact)")
      assert_includes(html, "bounds.width === 0 || bounds.height === 0")
      assert_includes(html, "Ruby code highlights")
      assert_includes(html, "dependency stars remain anonymous")
      assert_includes(html, "const contextVisibility = { selection: .75, category: .16, package: .75 }")
      assert_includes(html, "focusedDependencyPoint || selected ? 1.0 : u_categoryEmphasis[category]")
      assert_includes(html, "if (selectionLocked && selectedPoint) return [contextVisibility.selection")
      assert_includes(html, '["core", "tests", "dependencies"].map(category => (category === focusedCategory ? 1 : contextVisibility.category))')
      assert_includes(html, "bool detailed = emphasis >= 0.1")
      assert_includes(html, "function moveViewWithArrow")
      assert_includes(html, 'target.matches("textarea, select")')
      assert_includes(html, '!["checkbox", "radio", "button", "submit", "reset"].includes(target.type)')
      assert_includes(html, 'if (event.key === "ArrowLeft") panBy(distance, 0)')
      assert_includes(html, 'else if (event.key === "ArrowRight") panBy(-distance, 0)')
      assert_includes(html, 'else if (event.key === "ArrowUp") panBy(0, distance)')
      assert_includes(html, 'else if (event.key === "ArrowDown") panBy(0, -distance)')
      assert_includes(html, "pitch = clamp(pitch + dy * .004, -TOP_DOWN_PITCH, TOP_DOWN_PITCH)")
      assert_includes(html, 'window.addEventListener("keydown", event => {')
      assert_includes(html, "else if (!handleViewShortcut(event)) moveViewWithArrow(event)")
      assert_includes(html, "arrow keys to move the view")
      refute_includes(html, 'name="rubylens-artifact" content="showcase"')
      assert_includes(html, '"durationMs": 60000')
      assert_includes(html, "const { sceneData, scenePointCount, interactivePoints, dependencyHubs, packageHubs, systemHubs } = buildPoints()")
      assert_includes(html, "gl.bufferData(gl.ARRAY_BUFFER, renderPointData, gl.STATIC_DRAW)")
      assert_includes(html, "function applyShowcaseCamera(progress)")
      assert_includes(html, "function renderShowcase(timestamp)")
      assert_includes(html, 'dataset.showcaseRenderer = "unavailable"')
      assert_includes(html, "if (interactiveMode) {")
      assert_includes(html, "if (exact) return exact.hub ? exact : null")
      refute_includes(html, "{{MODEL_BASE64}}")
      refute_match(%r{https?://}, html)
      assert_equal(0o600, File.stat(output).mode & 0o777)
      assert_equal("*\n", File.read(File.join(directory, ".rubylens", ".gitignore")))
    end
  end
end
