# frozen_string_literal: true

require_relative "test_helper"

class ShowcaseWriterTest < Minitest::Test
  def test_writes_a_private_self_contained_noninteractive_showcase
    Dir.mktmpdir("rubylens-showcase-") do |directory|
      output = File.join(directory, "showcase.html")
      model = {
        "schema" => "rubylens.showcase.v1",
        "projectName" => "Synthetic App",
        "details" => false,
        "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 0] },
        "namespaces" => [],
        "packages" => [],
        "dependencyStars" => [],
      }

      RubyLens::ShowcaseWriter.new.write(model, output: output)
      html = File.read(output)

      assert(RubyLens::ShowcaseWriter.new.rubylens_showcase?(output))
      assert_includes(html, '<meta name="rubylens-artifact" content="showcase">')
      assert_includes(html, 'data-rubylens-mode="showcase"')
      assert_includes(html, "const SHOWCASE_PRESET = Object.freeze")
      assert_includes(html, '"durationMs": 60000')
      assert_includes(html, "if (hubs.length >= availableAfterPins)")
      assert_includes(html, 'class="showcase-stage"')
      assert_includes(html, 'dataset.showcaseRenderer = "webgl2"')
      assert_includes(html, "function renderShowcase(timestamp)")
      assert_includes(html, 'dataset.showcaseReady = "true"')
      assert_includes(html, 'dataset.showcaseMotion = "reduced"')
      assert_includes(html, 'class="cinema-stats"')
      assert_includes(html, 'class="cinema-stats" aria-label="Codebase statistics" hidden')
      assert_includes(html, 'class="cinema-annotation" id="cinema-annotation" aria-hidden="true" hidden')
      assert_includes(html, "const showcaseDetails = showcaseMode && model.details === true")
      refute_includes(html, "{{MODEL_BASE64}}")
      refute_includes(html, "capture=1")
      refute_includes(html, "RubyLensCapture")
      refute_match(/<(?:button|aside|iframe|input|select|textarea)\b/, html)
      refute_match(/<canvas[^>]*tabindex=/, html)
      refute_match(%r{https?://}, html)
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
      refute(writer.rubylens_showcase?(report))
      assert(writer.rubylens_showcase?(showcase))
    end
  end
end
