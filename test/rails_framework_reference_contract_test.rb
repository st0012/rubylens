# frozen_string_literal: true

require_relative "test_helper"

class RailsFrameworkReferenceContractTest < Minitest::Test
  RUNTIME_PATH = File.expand_path("../assets/runtime/report.js", __dir__)

  def test_uses_the_shared_art_v9_radius_and_whole_core_host_without_region_coupling
    builder = File.read(File.expand_path("../lib/rubylens/art_model_builder.rb", __dir__))
    runtime = File.read(RUNTIME_PATH)
    renderer = runtime[/function renderRailsReference\(matrix\) \{.*?^    \}/m]

    assert_includes(builder, "Model::WorkspaceLayout.radius(namespace_count)")
    assert_includes(runtime, "Number(frameworkReference.systemRadius || 0) / 1000 * projected[2]")
    assert_includes(runtime, "const hostRadius = workspaceRadius * projected[2]")
    assert_includes(runtime, "project({ position: [0, 0, 0] }, matrix)")
    assert_includes(runtime, 'createFrameworkMetric("Core host", model.categoryStats.core)')
    assert_includes(runtime, "Number(model.workspaceDensity[1] || 0) > 0")
    refute_nil(renderer)
    refute_includes(renderer, "focusedGroupIndex")
    refute_includes(renderer, "regionCentroids")
  end

  def test_draws_one_neutral_same_scale_ruler_without_adding_render_points
    runtime = File.read(RUNTIME_PATH)

    assert_includes(runtime, "Math.hypot(x - projected[0], y - projected[1]) >= minimumOffset")
    assert_includes(runtime, "context.arc(x, y, referenceRadius, 0, Math.PI * 2)")
    assert_includes(runtime, "context.moveTo(x - referenceRadius, y)")
    assert_includes(runtime, "Rails ${frameworkReference.version} · same scale")
    assert_includes(runtime, "renderRailsReference(matrix)")
    refute_match(/addPoint\([^\n]*frameworkReference/, runtime)
    refute_match(/renderPoints[^\n]*frameworkReference/, runtime)
  end

  def test_flags_only_the_existing_exact_rails_landmark_without_changing_its_geometry
    runtime = File.read(RUNTIME_PATH)
    hub_line = runtime.lines.find { |line| line.include?("base: 1.8, hub: true") }

    refute_nil(hub_line)
    assert_includes(hub_line, "base: 1.8")
    refute_includes(hub_line, "framework")
    assert_includes(runtime, 'frameworkReference?.kind === "rails"')
    assert_includes(runtime, "dependencyHubs.find(point => point.packageIndex === frameworkReference.packageIndex)")
    assert_includes(runtime, "context.fillRect(x + offset, y - offset, 3, 3)")
  end

  def test_uses_an_accessible_whole_host_control_and_suppresses_incomplete_data
    runtime = File.read(RUNTIME_PATH)

    assert_includes(runtime, 'toggle.type = "button"')
    assert_includes(runtime, 'toggle.setAttribute("aria-pressed", "false")')
    assert_includes(runtime, 'toggle.setAttribute("aria-label", `Compare the whole Core host with Rails ${frameworkReference.version}`)')
    assert_includes(runtime, 'railsReferenceStatus.setAttribute("aria-live", "polite")')
    assert_includes(runtime, 'frameworkReference.members.join(", ")')
    assert_includes(runtime, "Comparison unavailable:")
    assert_includes(runtime, "framework gems available for indexing")
    assert_includes(runtime, "whole Core host")
    refute_includes(runtime, "Select a Core system")
    refute_includes(runtime, "Select a Core region")
    refute_includes(runtime, 'document.addEventListener("rubylens:core-region-focus"')
    refute_includes(runtime, "declaration count")
    refute_includes(runtime, "definition count")
  end

  def test_reference_code_adds_no_context_or_animation_loop
    runtime = File.read(RUNTIME_PATH)
    control = runtime[/function createRailsReferenceControl\(\) \{.*?^    \}/m]
    renderer = runtime[/function renderRailsReference\(matrix\) \{.*?^    \}/m]

    refute_nil(control)
    refute_nil(renderer)
    refute_includes(control, "createElement(\"canvas\")")
    refute_includes(control, "getContext")
    refute_includes(renderer, "requestAnimationFrame")
  end

  def test_comparison_is_an_overview_only_state_with_truthful_transitions
    runtime = File.read(RUNTIME_PATH)
    toggle = runtime[/toggle\.addEventListener\("click", \(\) => \{.*?^      \}\);/m]

    refute_nil(toggle)
    assert_includes(toggle, "clearExplorationFocus()")
    assert_includes(toggle, 'setCategoryVisible("core", true)')
    assert_includes(toggle, "railsComparisonEnabled = true")
    assert_includes(toggle, "flyCamera({ yaw: -.36, pitch: .34, zoom: 1, panX: 0, panY: 0 })")
    assert_includes(runtime, 'disableRailsComparison("Same-scale comparison turned off because category focus leaves the whole-host overview.")')
    assert_includes(runtime, 'disableRailsComparison("Same-scale comparison turned off because item focus leaves the whole-host overview.")')
    assert_includes(runtime, 'disableRailsComparison("Same-scale comparison turned off because region focus leaves the whole-host overview.")')
    assert_includes(runtime, 'disableRailsComparison("Same-scale comparison turned off because gem expansion leaves the whole-host overview.")')
    assert_includes(runtime, 'disableRailsComparison("Same-scale comparison turned off because Core code is hidden.")')
    assert_includes(runtime, "railsComparisonNotice ||")
  end
end
