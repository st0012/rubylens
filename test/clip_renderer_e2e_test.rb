# frozen_string_literal: true

require_relative "test_helper"

# End-to-end clip rendering through real headless Chrome and ffmpeg. Opt-in
# because it needs both tools installed: RUBYLENS_CLIP_E2E=1 bundle exec rake
# test (with RUBYLENS_CHROME/RUBYLENS_FFMPEG set if discovery needs help).
class ClipRendererE2ETest < Minitest::Test
  def test_renders_a_playable_marked_mp4_from_a_showcase
    skip("set RUBYLENS_CLIP_E2E=1 to run the Chrome+ffmpeg clip test") unless ENV["RUBYLENS_CLIP_E2E"]

    Dir.mktmpdir("rubylens-clip-e2e-") do |directory|
      showcase = File.join(directory, "showcase.html")
      RubyLens::ShowcaseWriter.new.write(fixture_showcase_model, output: showcase)
      output = File.join(directory, "clip.mp4")
      renderer = RubyLens::Clip::Renderer.new(
        chrome: RubyLens::Clip::Toolchain.chrome_path,
        ffmpeg: RubyLens::Clip::Toolchain.ffmpeg_path,
        fps: 12,
        frame_limit: 12,
      )

      renderer.render(showcase_html: showcase, output: output)

      assert_operator(File.size(output), :>, 10_000)
      assert(RubyLens::ArtifactMarker.present?(output, RubyLens::Clip::Renderer::MARKER_COMMENT, head_bytes: RubyLens::ClipGenerator::MARKER_SCAN_HEAD_BYTES))
      assert_equal("ftyp", File.binread(output, 8).byteslice(4, 4))
    end
  end

  private

  def fixture_showcase_model(namespaces: 300, packages: 4, stars: 400)
    random = Random.new(0x51a7e11a)
    seed = -> { random.rand(0x1_0000_0000) }
    rows = Array.new(namespaces) do |index|
      test = index < namespaces / 5 ? 1 : 0
      kind = (index % 5).zero? ? 1 : 0
      [seed.call, kind, test, index % 9, 1 + (index % 3), index % 2, index % 30, index % 80, index % 20,
       kind.zero? ? 1 : 0, kind, 1 + (index % 40), index % 5, index % 4]
    end
    package_rows = Array.new(packages) do |index|
      [seed.call, (index % 3).zero? ? 0 : 1, 1, stars / packages, 2 + index, 1, 10 + index, index % 4, -1]
    end
    package_morphologies = Array.new(packages) { |index| [index % 5, 250, 260, 3, 100, 400, 0, 0, 0, seed.call] }
    dependency_stars = Array.new(stars) do |index|
      [seed.call, index % packages, index % 6, 1 + (index % 2), index % 3, index % 25, index % 60, index % 15]
    end
    constant_reference_links = Array.new([[namespaces - 1, 0].max, 8].min) do |index|
      [index, index + 1]
    end
    {
      "schema" => "rubylens.showcase.v7",
      "projectName" => "Clip E2E Fixture",
      "details" => false,
      "domains" => { "ancestorDepth" => 9, "definitionSites" => 3, "reopenings" => 2,
                     "descendants" => 30, "references" => 80, "members" => 20 },
      "morphology" => [2, 0, 240, 3, 105, 380, 0, 0, 0, 42],
      "namespaces" => rows,
      "constantReferenceLinks" => constant_reference_links,
      "packages" => package_rows,
      "packageMorphologies" => package_morphologies,
      "dependencySystems" => [[seed.call, 0]],
      "dependencyStars" => dependency_stars,
    }
  end
end
