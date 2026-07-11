# frozen_string_literal: true

require "digest"
require_relative "test_helper"

class ReportAssetAssemblerTest < Minitest::Test
  # SHA-256 of assets/report.html at 81427e6, before the renderer assets were extracted.
  REPORT_HTML_81427E6_SHA256 = "b5469adb1b773a164150a8a50c149f8d1fd4706de8b1638cafde8ce81d66f21c"

  def test_assembles_assets_byte_for_byte_with_the_81427e6_report_baseline
    assert_equal(
      REPORT_HTML_81427E6_SHA256,
      Digest::SHA256.hexdigest(RubyLens::ReportAssetAssembler.new.assemble)
    )
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
