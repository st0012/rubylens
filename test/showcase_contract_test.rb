# frozen_string_literal: true

require_relative "test_helper"

# Showcase shell and stylesheet contracts. Everything that targets the JS
# runtime — presets, shaders, choreography, dataset flags — lives in
# test/js/showcase_contract.test.mjs; Ruby asserts only the assets Ruby ships
# verbatim and the Ruby-side constants that must stay in step with them.
class ShowcaseContractTest < Minitest::Test
  SHELL = File.read(File.expand_path("../assets/shells/showcase.html", __dir__))
  STYLES = File.read(File.expand_path("../assets/styles/showcase.css", __dir__))

  def test_galaxy_summary_sits_with_the_title_in_both_showcase_modes
    assert_match(%r{<h1>Ruby project</h1>\s*<p class="galaxy-summary" id="galaxy-summary"></p>}, SHELL)
    assert_includes(STYLES, 'html[data-showcase-layout="widescreen"] .galaxy-summary')
    assert_includes(STYLES, "@media (max-width: 600px)")
    assert_includes(STYLES, ".galaxy-summary { font-size: 24px; }")
  end

  def test_widescreen_layout_styles_scale_the_masthead
    assert_includes(STYLES, "font: 500 38.88px/1.05 ui-serif")
    assert_includes(STYLES, 'html[data-showcase-layout="widescreen"] .cinema-stats')
  end

  def test_webgl2_unavailable_state_is_accessible
    assert_includes(SHELL, 'id="showcase-status" role="status" aria-live="polite" hidden')
    assert_includes(STYLES, ".showcase-status { max-width: 720px; font-size: 24px; }")
  end

  def test_annotation_limit_matches_the_runtime_preset_pin
    # The JS side pins SHOWCASE_ANNOTATION_PRESET.limit to the same number in
    # test/js/showcase_contract.test.mjs; each side asserts it independently.
    assert_equal(200, RubyLens::ShowcaseModel::ANNOTATION_LIMIT)
  end

  def test_clip_mode_styles_disable_css_annotation_fades
    # Inline clip-frame opacity only works because clip mode turns fades off.
    assert_includes(STYLES, "html[data-rubylens-clip] .cinema-annotation")
  end
end
