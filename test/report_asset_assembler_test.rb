# frozen_string_literal: true

require "digest"
require_relative "test_helper"

class ReportAssetAssemblerTest < Minitest::Test
  # SHA-256 of the supported Explorer shell with the shared canonical Showcase runtime.
  REPORT_HTML_SHA256 = "f5a5ead040b544aeab2f664c36da5549e5b9e052cf6bec5a41687ebe3ec7d30e"

  def test_assembles_the_supported_explorer_assets_byte_for_byte
    assert_equal(
      REPORT_HTML_SHA256,
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
