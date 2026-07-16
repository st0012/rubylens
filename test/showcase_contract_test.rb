# frozen_string_literal: true

require "json"
require "open3"
require_relative "test_helper"

class ShowcaseContractTest < Minitest::Test
  RUNTIME_PATH = File.expand_path("../assets/runtime/report.js", __dir__)
  STYLES_PATH = File.expand_path("../assets/styles/showcase.css", __dir__)
  APPROVED_PRESET = {
    "stageWidth" => 1920,
    "stageHeight" => 1080,
    "durationMs" => 60_000,
    "targetFps" => 60,
    "turns" => 1,
    "startAngleDegrees" => -54,
    "elevationDegrees" => -25,
    "elevationSwayDegrees" => 1.5,
    "zoom" => 1.6,
    "zoomBreathPercent" => 0,
    "centerXPercent" => 49,
    "centerYPercent" => 67,
    "starBrightnessPercent" => 75,
    "pointGlowPercent" => 35,
    "backgroundGlowPercent" => 200,
    "textScalePercent" => 80,
    "layoutReferenceWidth" => 720,
    "layoutReferenceHeight" => 405,
    "mastheadLeft" => 44,
    "mastheadTop" => 40,
    "mastheadWidth" => 632,
  }.freeze
  APPROVED_ANNOTATION_PRESET = {
    "limit" => 200,
    "slotDurationMs" => 6_000,
    "revealStartMs" => 1_350,
    "revealEndMs" => 4_650,
    "fadeInMs" => 1_200,
    "fadeOutMs" => 900,
    "safeInsetX" => 80,
    "safeInsetTop" => 340,
    "safeInsetBottom" => 90,
    "labelWidth" => 440,
  }.freeze
  APPROVED_WIDESCREEN_LAYOUT_PRESET = {
    "minimumFittedWidth" => 1600,
    "minimumAspectRatio" => 1.6,
    "centerXPercent" => 49,
    "centerYPercent" => 54,
    "textScalePercent" => 44,
    "layoutReferenceWidth" => 720,
    "mastheadLeft" => 44,
    "mastheadTop" => 17,
    "mastheadWidth" => 420,
  }.freeze
  APPROVED_DEPENDENCY_PRESET = {
    "starSizeScale" => 1.5,
    "starAlphaScale" => 1.2,
  }.freeze

  def test_approved_showcase_preset_is_exact
    assert_equal(APPROVED_PRESET, showcase_preset)
  end

  def test_galaxy_summary_sits_with_the_title_in_both_showcase_modes
    shell = File.read(File.expand_path("../assets/shells/showcase.html", __dir__))
    styles = File.read(STYLES_PATH)

    assert_match(%r{<h1>Ruby project</h1>\s*<p class="galaxy-summary" id="galaxy-summary"></p>}, shell)
    assert_includes(styles, 'html[data-showcase-layout="widescreen"] .galaxy-summary')
    assert_includes(styles, "@media (max-width: 600px)")
    assert_includes(styles, ".galaxy-summary { font-size: 24px; }")
  end

  def test_widescreen_layout_tightens_the_masthead_and_raises_the_scene
    assert_equal(
      APPROVED_WIDESCREEN_LAYOUT_PRESET,
      showcase_preset("SHOWCASE_WIDESCREEN_LAYOUT_PRESET"),
    )

    layout_selection = runtime_function("selectShowcaseLayout")
    assert_includes(layout_selection, "fittedWidth >= SHOWCASE_WIDESCREEN_LAYOUT_PRESET.minimumFittedWidth")
    assert_includes(layout_selection, "aspectRatio >= SHOWCASE_WIDESCREEN_LAYOUT_PRESET.minimumAspectRatio")
    assert_includes(layout_selection, 'dataset.showcaseLayout = widescreen ? "widescreen" : "default"')
    assert_includes(runtime_function("configureShowcaseStage"), "activeShowcaseLayout = selectShowcaseLayout()")
    assert_includes(runtime_function("resize"), "configureShowcaseStage()")
    assert_includes(runtime_function("updateSceneViewport"), "activeShowcaseLayout.centerYPercent")

    styles = File.read(STYLES_PATH)
    assert_includes(styles, "font: 500 38.88px/1.05 ui-serif")
    assert_includes(styles, 'html[data-showcase-layout="widescreen"] .cinema-stats')
  end

  def test_approved_camera_positions_complete_one_clockwise_turn_in_sixty_seconds
    preset = showcase_preset
    assert_equal(3_600, preset.fetch("targetFps") * preset.fetch("durationMs") / 1000)

    expected = [
      [-54, -25],
      [36, -23.5],
      [126, -25],
      [216, -26.5],
      [-54, -25],
    ]
    actual = [0, 0.25, 0.5, 0.75, 1].map do |progress|
      wrapped = ((progress % 1) + 1) % 1
      phase = wrapped * 360 * preset.fetch("turns")
      yaw = preset.fetch("startAngleDegrees") + phase
      pitch = preset.fetch("elevationDegrees") + Math.sin(phase * Math::PI / 180) * preset.fetch("elevationSwayDegrees")
      [yaw, pitch.round(10)]
    end
    assert_equal(expected, actual)

    last_frame_progress = 3_599.0 / 3_600
    last_frame_yaw = preset.fetch("startAngleDegrees") + last_frame_progress * 360
    assert_in_delta(305.9, last_frame_yaw, 1e-10)
  end

  def test_showcase_clockwise_motion_is_the_shared_default_across_pitch_hemispheres
    runtime = File.read(RUNTIME_PATH)
    direction = runtime.match(/^    const DEFAULT_ROTATION_DIRECTION = .*?;$/).to_s.strip
    refute_empty(direction)
    assert_equal('const DEFAULT_ROTATION_DIRECTION = "clockwise";', direction)

    script = <<~JAVASCRIPT
      #{direction}
      #{runtime_function("screenRotationYawSign")}
      process.stdout.write(JSON.stringify({
        showcase: screenRotationYawSign(-25 * Math.PI / 180),
        explorer: screenRotationYawSign(.34),
        horizon: screenRotationYawSign(0),
      }));
    JAVASCRIPT
    output, error, status = Open3.capture3("node", "-e", script)
    assert(status.success?, "Node failed: #{error}")
    assert_equal(
      { "showcase" => 1, "explorer" => -1, "horizon" => 1 },
      JSON.parse(output),
    )

    showcase_camera = runtime_function("applyShowcaseCamera")
    assert_includes(showcase_camera, "screenRotationYawSign(SHOWCASE_PRESET.elevationDegrees * Math.PI / 180)")
  end

  def test_runtime_uses_the_preset_for_fixed_stage_motion_and_lighting
    runtime = File.read(RUNTIME_PATH)

    %w[
      stageWidth stageHeight durationMs targetFps turns startAngleDegrees
      elevationDegrees elevationSwayDegrees zoom zoomBreathPercent centerXPercent
      centerYPercent starBrightnessPercent pointGlowPercent backgroundGlowPercent
      textScalePercent
    ].each do |field|
      assert_includes(runtime, "SHOWCASE_PRESET.#{field}")
    end
    assert_includes(runtime, "requestAnimationFrame(renderShowcase)")
    assert_includes(runtime, "Math.min(window.innerWidth / SHOWCASE_PRESET.stageWidth, window.innerHeight / SHOWCASE_PRESET.stageHeight)")
  end

  def test_dependency_preset_only_amplifies_ordinary_showcase_stars
    assert_equal(APPROVED_DEPENDENCY_PRESET, showcase_preset("SHOWCASE_DEPENDENCY_PRESET"))

    renderer = runtime_function("createShowcaseRenderer")
    assert_includes(renderer, 'point.category === "dependencies" && !point.hub')
    assert_includes(renderer, "SHOWCASE_DEPENDENCY_PRESET.starSizeScale")
    assert_includes(renderer, "SHOWCASE_DEPENDENCY_PRESET.starAlphaScale")
  end

  def test_showcase_renders_every_scene_point
    runtime = File.read(RUNTIME_PATH)
    assert_includes(runtime, "const renderPoints = points")
    assert_includes(runtime_function("createShowcaseRenderer"), "new Float32Array(renderPoints.length * 7)")
    assert_includes(runtime_function("updateGalaxySummary"), '"scene points"')
  end

  def test_showcase_requires_webgl2_and_fails_explicitly
    runtime = File.read(RUNTIME_PATH)
    shell = File.read(File.expand_path("../assets/shells/showcase.html", __dir__))
    renderer = runtime_function("createShowcaseRenderer")
    unavailable = runtime_function("markShowcaseUnavailable")

    assert_includes(shell, 'id="showcase-status" role="status" aria-live="polite" hidden')
    assert_includes(renderer, 'canvas.getContext("webgl2"')
    assert_includes(renderer, 'dataset.showcaseUnavailableReason = "webgl2-unavailable"')
    assert_includes(renderer, 'dataset.showcaseUnavailableReason = "webgl2-point-size-range"')
    assert_includes(renderer, 'markShowcaseUnavailable("webgl2-context-lost")')
    assert_includes(runtime, 'dataset.showcaseUnavailableReason = "webgl2-initialization-error"')
    assert_includes(unavailable, 'dataset.showcaseRenderer = "unavailable"')
    assert_includes(unavailable, "plottedDependencyDeclarations = 0")
    assert_includes(unavailable, "dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations)")
    assert_includes(unavailable, 'dataset.plottedScenePoints = "0"')
    assert_includes(unavailable, 'dataset.showcaseMotion = "unavailable"')
    assert_includes(unavailable, 'dataset.showcaseReady = "true"')
    assert_includes(unavailable, 'showcaseStatus.textContent = "WebGL2 is required to render this complete Showcase."')
    assert_includes(runtime, 'const context = interactiveMode ? canvas.getContext("2d"')
    assert_includes(File.read(STYLES_PATH), ".showcase-status { max-width: 720px; font-size: 24px; }")
  end

  def test_approved_annotation_timing_and_tracking_contract_is_exact
    assert_equal(APPROVED_ANNOTATION_PRESET, showcase_preset("SHOWCASE_ANNOTATION_PRESET"))
    assert_equal(APPROVED_ANNOTATION_PRESET.fetch("limit"), RubyLens::ShowcaseModel::ANNOTATION_LIMIT)
    runtime = File.read(RUNTIME_PATH)
    render_showcase = runtime.match(/function renderShowcase\(timestamp\) \{(?<body>.*?)^    \}/m)[:body]
    update_annotation = runtime.match(/function updateShowcaseAnnotation\(timestamp\) \{(?<body>.*?)^    \}/m)[:body]

    assert_operator(render_showcase.index("applyShowcaseCamera(progress)"), :<, render_showcase.index("render(timestamp)"))
    assert_operator(render_showcase.index("render(timestamp)"), :<, render_showcase.index("updateShowcaseAnnotation(timestamp)"))
    assert_includes(update_annotation, "project(activeShowcaseAnnotation.annotation.point, matrix)")
    assert_includes(update_annotation, "showcaseAnnotation.style.transform")
    assert_includes(update_annotation, "slotElapsed >= SHOWCASE_ANNOTATION_PRESET.revealStartMs")
    assert_includes(update_annotation, "slotElapsed <= SHOWCASE_ANNOTATION_PRESET.revealEndMs")
    assert_includes(runtime, "--annotation-fade-in")
    assert_includes(runtime, "SHOWCASE_ANNOTATION_PRESET.fadeOutMs")
  end

  def test_annotation_work_is_opt_in_bounded_and_disabled_for_reduced_motion
    runtime = File.read(RUNTIME_PATH)
    reduced_branch = runtime.match(/function startShowcase\(\) \{.*?if \(reducedMotionQuery\.matches\) \{(?<body>.*?)\} else \{/m)[:body]

    assert_includes(runtime, "model.details === true")
    assert_includes(runtime, ".slice(0, SHOWCASE_ANNOTATION_PRESET.limit)")
    assert_includes(runtime, "Array.isArray(model.pinnedNamespaceAnchors)")
    assert_includes(runtime_function("buildPoints"), "showcasePinnedNamespaceAnchors.has(index)")
    assert_includes(runtime_function("buildPoints"), "showcasePointsByAnchor.set(annotationKey, point)")
    assert_includes(reduced_branch, "showcaseAnnotation.hidden = true")
    assert_includes(reduced_branch, "hideShowcaseAnnotation()")
    refute_includes(reduced_branch, "updateShowcaseAnnotation")
  end

  def test_reduced_motion_renders_one_stable_start_frame_without_scheduling_motion
    runtime = File.read(RUNTIME_PATH)
    reduced_branch = runtime.match(/function startShowcase\(\) \{.*?if \(reducedMotionQuery\.matches\) \{(?<body>.*?)\} else \{/m)

    refute_nil(reduced_branch)
    assert_includes(reduced_branch[:body], "applyShowcaseCamera(0)")
    assert_includes(reduced_branch[:body], "render(performance.now())")
    assert_includes(reduced_branch[:body], 'dataset.showcaseMotion = "reduced"')
    refute_includes(reduced_branch[:body], "requestAnimationFrame")
    assert_includes(runtime, 'reducedMotionQuery.addEventListener("change", startShowcase)')
  end

  private

  def showcase_preset(name = "SHOWCASE_PRESET")
    runtime = File.read(RUNTIME_PATH)
    match = runtime.match(/const #{Regexp.escape(name)} = Object\.freeze\((\{.*?^\s*\})\);/m)
    refute_nil(match, "#{name} must be a JSON object frozen in the shipped runtime")
    JSON.parse(match[1])
  end

  def runtime_function(name)
    source = File.read(RUNTIME_PATH).match(/^    function #{Regexp.escape(name)}\b.*?^    \}\n/m).to_s
    raise "#{name} function not found" if source.empty?

    source
  end
end
