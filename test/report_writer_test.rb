# frozen_string_literal: true

require "base64"
require_relative "test_helper"

class ReportWriterTest < Minitest::Test
  def test_writes_an_offline_owner_only_report_and_protects_default_directory
    Dir.mktmpdir("rubylens-report-") do |directory|
      output = File.join(directory, ".rubylens", "report.html")
      model = { "schema" => "rubylens.art.v2", "projectName" => "Demo", "totals" => { "namespaces" => 2 } }

      RubyLens::ReportWriter.new.write(model, output: output)

      html = File.read(output)
      encoded = html.match(/atob\("([A-Za-z0-9+\/=]+)"\)/).captures.first
      assert_equal(model, JSON.parse(Base64.strict_decode64(encoded)))
      assert_includes(html, "connect-src 'none'")
      assert(RubyLens::ReportWriter.new.rubylens_report?(output))
      assert_includes(html, "Explore this codebase")
      assert_includes(html, "Widest transitive descendant reach")
      assert_includes(html, 'Focus ${meta.title}')
      assert_includes(html, 'new Set(["Object", "Kernel", "BasicObject"])')
      assert_includes(html, 'aria-label="Pan mode"')
      assert_includes(html, "function zoomBetween")
      assert_includes(html, "Shift-drag or Pan mode to move")
      assert_includes(html, "function focusDependencyPackage")
      assert_includes(html, "Double-click gem clouds")
      assert_includes(html, "press Enter or F on a selected gem star")
      assert_includes(html, "Expanded plotted declarations")
      assert_includes(html, "if (event.metaKey || event.ctrlKey || event.altKey) return")
      assert_includes(html, 'if (exact) return exact.category === "dependencies" ? exact : null')
      refute_includes(html, "Stellar weights")
      refute_includes(html, 'type = "range"')
      refute_includes(html, "{{MODEL_BASE64}}")
      refute_match(%r{https?://}, html)
      assert_equal(0o600, File.stat(output).mode & 0o777)
      assert_equal("*\n", File.read(File.join(directory, ".rubylens", ".gitignore")))
    end
  end
end
