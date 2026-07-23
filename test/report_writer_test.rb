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
      # The privacy footer is a product contract of every generated report:
      # the owner-only warning must reach the reader.
      assert_includes(html, "dependency stars remain anonymous")
      assert_includes(html, "Do not share the HTML unless you intend to disclose codebase structure.")

      # The shipped assets arrive verbatim: the stylesheet in full, and the
      # runtime in full around the one model substitution. What the runtime
      # contains is the JS suite's concern, not this writer's.
      assets = File.expand_path("../assets", __dir__)
      assert_includes(html, File.read(File.join(assets, "styles/report.css")))
      runtime_head, runtime_tail = File.read(File.join(assets, "runtime/report.js")).split("{{MODEL_BASE64}}")
      assert_includes(html, runtime_head)
      assert_includes(html, runtime_tail)
      refute_includes(html, 'name="rubylens-artifact" content="showcase"')
      refute_includes(html, "{{MODEL_BASE64}}")
      refute_match(%r{https?://}, html)
      assert_equal(0o600, File.stat(output).mode & 0o777)
      assert_equal("*\n", File.read(File.join(directory, ".rubylens", ".gitignore")))
    end
  end
end
