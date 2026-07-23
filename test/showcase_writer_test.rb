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
      assert_includes(html, '<meta name="rubylens-artifact" content="showcase">')
      assert_includes(html, 'data-rubylens-mode="showcase"')
      # The shared canonical runtime arrives verbatim around the one model
      # substitution; its content is the JS suite's concern
      # (test/js/showcase_contract.test.mjs), not this writer's.
      runtime_head, runtime_tail = File.read(File.expand_path("../assets/runtime/report.js", __dir__)).split("{{MODEL_BASE64}}")
      assert_includes(html, runtime_head)
      assert_includes(html, runtime_tail)
      assert_includes(html, 'class="showcase-stage"')
      assert_includes(html, 'id="showcase-status" role="status" aria-live="polite" hidden')
      assert_includes(html, 'class="cinema-stats"')
      assert_includes(html, 'class="cinema-stats" aria-label="Codebase statistics" hidden')
      assert_includes(html, 'class="cinema-annotation" id="cinema-annotation" aria-hidden="true" hidden')
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
