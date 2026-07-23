# frozen_string_literal: true

require_relative "test_helper"

class ReportAssetAssemblerTest < Minitest::Test
  ASSETS = File.expand_path("../assets", __dir__)

  # Assembly is exactly the shell with each placeholder spliced once, byte for
  # byte, derived from the shipped asset files themselves — asset content is
  # each surface's own concern (the JS suite owns the runtime), so no digest
  # pin needs re-recording when an asset changes.
  def test_assembles_the_supported_explorer_assets_byte_for_byte
    expected = File.read(File.join(ASSETS, "shells/report.html"))
      .sub("{{REPORT_STYLES}}") { File.read(File.join(ASSETS, "styles/report.css")) }
      .sub("{{REPORT_RUNTIME}}") { File.read(File.join(ASSETS, "runtime/report.js")) }
    assert_equal(expected, RubyLens::ReportAssetAssembler.new.assemble)
  end

  def test_requires_each_asset_placeholder_exactly_once
    Dir.mktmpdir("rubylens-report-assets-") do |directory|
      stylesheet = write(directory, "report.css", "body {}\n")
      runtime = write(directory, "report.js", '"use strict";\n')

      error = assert_raises(RubyLens::Error) do
        assembler(shell: "{{REPORT_RUNTIME}}", stylesheet:, runtime:).assemble
      end
      assert_equal(
        "report shell must contain exactly one {{REPORT_STYLES}} placeholder",
        error.message
      )

      error = assert_raises(RubyLens::Error) do
        assembler(shell: "{{REPORT_STYLES}}{{REPORT_RUNTIME}}{{REPORT_RUNTIME}}", stylesheet:, runtime:).assemble
      end
      assert_equal(
        "report shell must contain exactly one {{REPORT_RUNTIME}} placeholder",
        error.message
      )
    end
  end

  private

  def assembler(shell:, stylesheet:, runtime:)
    RubyLens::ReportAssetAssembler.new(
      shell_path: write(File.dirname(stylesheet), "report.html", shell),
      stylesheet_path: stylesheet,
      runtime_path: runtime
    )
  end

  def write(directory, name, contents)
    path = File.join(directory, name)
    File.write(path, contents)
    path
  end
end
