# frozen_string_literal: true

require_relative "test_helper"

class ShowcaseWriterTest < Minitest::Test
  def test_writes_a_private_self_contained_noninteractive_showcase
    Dir.mktmpdir("rubylens-showcase-") do |directory|
      output = File.join(directory, "showcase.html")
      model = {
        "schema" => "rubylens.showcase.v2",
        "projectName" => "Synthetic App",
        "details" => false,
        "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 0] },
        "namespaces" => [],
        "packages" => [],
        "dependencySystems" => [],
        "dependencyStars" => [],
      }

      RubyLens::ShowcaseWriter.new.write(model, output: output)
      html = File.read(output)

      assert(RubyLens::ArtifactMarker.present?(output, RubyLens::ShowcaseWriter::MARKER))

      # The shipped assets arrive verbatim: shell segments, the stylesheet in
      # full, and the runtime around the one model substitution. What the
      # assets contain is the JS suite's concern.
      assets = File.expand_path("../assets", __dir__)
      File.read(File.join(assets, "shells/showcase.html")).split(/\{\{REPORT_STYLES\}\}|\{\{REPORT_RUNTIME\}\}/).each do |segment|
        assert_includes(html, segment)
      end
      assert_includes(html, File.read(File.join(assets, "styles/showcase.css")))
      runtime_head, runtime_tail = File.read(File.join(assets, "runtime/report.js")).split("{{MODEL_BASE64}}")
      assert_includes(html, runtime_head)
      assert_includes(html, runtime_tail)
      assert_equal(0o600, File.stat(output).mode & 0o777)
    end
  end

  def test_recognizes_only_a_showcase_marker
    Dir.mktmpdir("rubylens-showcase-") do |directory|
      report = File.join(directory, "report.html")
      showcase = File.join(directory, "showcase.html")
      File.write(report, '<meta name="generator" content="RubyLens">')
      File.write(showcase, '<meta name="rubylens-artifact" content="showcase">')

      writer = RubyLens::ShowcaseWriter.new
      refute(RubyLens::ArtifactMarker.present?(report, RubyLens::ShowcaseWriter::MARKER))
      assert(RubyLens::ArtifactMarker.present?(showcase, RubyLens::ShowcaseWriter::MARKER))
    end
  end
end
