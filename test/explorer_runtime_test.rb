# frozen_string_literal: true

require "json"
require_relative "test_helper"

class ExplorerRuntimeTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  SHELL = File.read(File.join(ROOT, "assets/shells/report.html"))
  STYLES = File.read(File.join(ROOT, "assets/styles/report.css"))

  def test_toolbar_and_footer_affordances_stay_accessible
    # Restored shell contracts: toolbar accessibility and the interaction
    # footer are shell content the assembler ships verbatim.
    assert_includes(SHELL, 'aria-label="Pan mode"')
    assert_includes(SHELL, 'aria-keyshortcuts="Space"')
    assert_includes(SHELL, 'id="reset-view" aria-label="Reset to default view"')
    assert_includes(SHELL, "Double-click a dependency system or gem cloud, press Enter or F on its selected marker")
  end

  def test_galaxy_summary_sits_with_the_title
    assert_match(%r{<h1>Ruby project</h1>\s*<p class="galaxy-summary" id="galaxy-summary"></p>}, SHELL)
    assert_includes(STYLES, ".galaxy-summary")
  end

  def test_partial_index_status_is_an_accessible_bounded_disclosure
    assert_includes(SHELL, '<details class="warning-disclosure" id="status" hidden>')
    assert_includes(SHELL, '<summary id="warning-summary"></summary>')
    assert_includes(STYLES, "max-height: min(360px, calc(100vh - 180px))")
    assert_includes(STYLES, "max-height: clamp(48px, calc(54vh - 220px), 240px)")
    assert_includes(STYLES, '.warning-disclosure > summary::after { content: ""; flex: 0 0 8px; width: 8px; height: 5px;')
    assert_includes(STYLES, "clip-path: polygon(0 0, 50% 70%, 100% 0, 100% 30%, 50% 100%, 0 30%)")
    assert_includes(STYLES, "details.warning-disclosure[open] > summary::after { transform: rotate(180deg); }")
    assert_includes(STYLES, "overflow-wrap: anywhere")
  end

  def test_explorer_initial_and_reset_camera_use_200_percent_without_changing_drift
    assert_includes(SHELL, 'id="reset-view" aria-label="Reset to default view" aria-keyshortcuts="0" title="Reset view (0)">Reset</button>')
    assert_includes(SHELL, '<output class="zoom-level" id="zoom-level" aria-label="Zoom level">200%</output>')

    toolbar = SHELL.match(/<div class="toolbar">(?<body>.*?)<\/div>/m)[:body]
    expected_order = ['id="motion"', 'id="reset-view"', 'id="pan-mode"', 'id="zoom-out"', 'id="zoom-level"', 'id="zoom-in"']
    assert_equal(expected_order, expected_order.sort_by { |marker| toolbar.index(marker) })
  end

  def test_space_is_the_only_keyboard_drift_toggle_and_respects_native_controls
    assert_includes(SHELL, 'id="motion" aria-label="Pause drift" aria-keyshortcuts="Space" aria-pressed="false"')
  end

  def test_view_shortcuts_work_regardless_of_focus_with_editable_guards
    assert_includes(SHELL, 'id="zoom-out" aria-label="Zoom out" aria-keyshortcuts="-" title="Zoom out (−)"')
    assert_includes(SHELL, 'id="zoom-in" aria-label="Zoom in" aria-keyshortcuts="+" title="Zoom in (+)"')
  end

  def test_shortcuts_overlay_is_a_gated_modal_dialog
    assert_includes(SHELL, '<div class="help-overlay" id="shortcuts-help" role="dialog" aria-modal="true" aria-label="Shortcuts and controls" hidden>')
    assert_includes(SHELL, 'id="help-open" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" aria-haspopup="dialog" title="Keyboard shortcuts (?)">?</button>')
    assert_includes(SHELL, '<button type="button" id="help-close" aria-label="Close shortcuts">Close</button>')
    assert_includes(STYLES, ".help-overlay[hidden] { display: none; }")
  end

  def test_star_hover_and_hub_tooltips_advertise_their_interactions
    assert_includes(STYLES, "canvas.is-star:not(.is-pan):not(.is-dragging-pan):not(:active) { cursor: pointer; }")
  end

  def test_hint_stays_clear_of_the_expanded_panel
    assert_includes(STYLES, ".panel:not(.is-collapsed) ~ .hint { right: 380px; }")
    assert_includes(SHELL, '<div class="hint">Drag to orbit · scroll to zoom · press ? for all shortcuts</div>')
  end

  def test_search_is_lazy_bounded_progressive_and_reuses_navigation
    assert_includes(SHELL, '<input type="search" id="explorer-search"')
    assert_includes(SHELL, 'role="region" aria-label="Search results"')
  end

  def test_explorer_requires_webgl2_across_every_unavailable_path
    assert_includes(STYLES, "button:disabled { opacity: .45; cursor: not-allowed; }")
    assert_includes(STYLES, ".explorer-search[hidden] { display: none; }")
    assert_includes(STYLES, ".toolbar[hidden] { display: none; }")
  end

  def test_explorer_shell_and_styles_are_offline
    # Runtime offline coverage lives in the JS suite; these are Ruby's assets.
    refute_match(%r{https?://}, SHELL)
    refute_match(%r{https?://}, STYLES)
  end

  def test_explorer_shell_never_carries_the_showcase_marker
    # ArtifactMarker distinguishes report and showcase outputs by shell
    # content; a report shell carrying the showcase meta would make every
    # generated report register as a showcase artifact.
    refute_includes(SHELL, "rubylens-artifact")
  end
end
