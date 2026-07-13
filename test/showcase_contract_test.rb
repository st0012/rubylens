# frozen_string_literal: true

require "json"
require_relative "test_helper"

class ShowcaseContractTest < Minitest::Test
  RUNTIME_PATH = File.expand_path("../assets/runtime/report.js", __dir__)
  APPROVED_PRESET = {
    "stageWidth" => 1920,
    "stageHeight" => 1080,
    "durationMs" => 60_000,
    "targetFps" => 60,
    "turns" => 1,
    "direction" => "clockwise",
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

  def test_approved_showcase_preset_is_exact
    assert_equal(APPROVED_PRESET, showcase_preset)
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

  def test_runtime_uses_the_preset_for_fixed_stage_motion_and_lighting
    runtime = File.read(RUNTIME_PATH)

    %w[
      stageWidth stageHeight durationMs targetFps turns direction startAngleDegrees
      elevationDegrees elevationSwayDegrees zoom zoomBreathPercent centerXPercent
      centerYPercent starBrightnessPercent pointGlowPercent backgroundGlowPercent
      textScalePercent
    ].each do |field|
      assert_includes(runtime, "SHOWCASE_PRESET.#{field}")
    end
    assert_includes(runtime, 'SHOWCASE_PRESET.direction === "clockwise" ? 1 : -1')
    assert_includes(runtime, "requestAnimationFrame(renderShowcase)")
    assert_includes(runtime, "Math.min(window.innerWidth / SHOWCASE_PRESET.stageWidth, window.innerHeight / SHOWCASE_PRESET.stageHeight)")
    refute_includes(runtime, "showcaseSceneRadius")
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
    assert_includes(runtime, "showcaseDetails ? Array.from(showcasePointsByAnchor.values()) : []")
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
end
