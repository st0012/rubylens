# frozen_string_literal: true

require_relative "test_helper"

class ClipGeneratorTest < Minitest::Test
  class FakeRenderer
    attr_reader :rendered_showcase_html

    def initialize(&on_render)
      @on_render = on_render
    end

    def render(showcase_html:, output:)
      @rendered_showcase_html = showcase_html
      @on_render ? @on_render.call(showcase_html, output) : File.binwrite(output, "ftyp#{RubyLens::Clip::Renderer::MARKER_COMMENT}")
      output
    end
  end

  def test_default_outputs_are_root_level_private_and_locally_excluded
    with_repository do |directory|
      renderer = FakeRenderer.new
      result = generate(path: directory, renderer: renderer)
      root = File.realpath(directory)
      clip = File.join(root, "rubylens-clip.mp4")
      showcase = File.join(root, "rubylens-showcase.html")

      assert_equal(clip, result.output_path)
      assert_equal(showcase, result.showcase_path)
      assert_equal(showcase, renderer.rendered_showcase_html)
      assert_equal(0o600, File.stat(clip).mode & 0o777)
      assert(RubyLens::ClipGenerator.new.rubylens_clip?(clip))
      assert(RubyLens::ShowcaseWriter.new.rubylens_showcase?(showcase))
      assert(system("git", "-C", directory, "check-ignore", "--quiet", clip))
      exclude = File.read(File.join(directory, ".git", "info", "exclude"))
      assert_includes(exclude, "/rubylens-clip.mp4")
      assert_includes(exclude, "/.rubylens-clip.mp4.*.tmp")
      assert_includes(exclude, "/rubylens-showcase.html")
    end
  end

  def test_default_output_refuses_an_unrelated_existing_file
    with_repository do |directory|
      output = File.join(directory, "rubylens-clip.mp4")
      File.write(output, "unrelated private file")

      error = assert_raises(RubyLens::Error) { generate(path: directory, renderer: FakeRenderer.new) }

      assert_equal("default clip path already exists and is not a RubyLens clip", error.message)
      assert_equal("unrelated private file", File.read(output))
    end
  end

  def test_default_output_replaces_an_existing_rubylens_clip
    with_repository do |directory|
      output = File.join(directory, "rubylens-clip.mp4")
      File.write(output, "old #{RubyLens::Clip::Renderer::MARKER_COMMENT} bytes")

      result = generate(path: directory, renderer: FakeRenderer.new)

      assert_equal(File.join(File.realpath(directory), "rubylens-clip.mp4"), result.output_path)
      refute_includes(File.read(output), "old ")
    end
  end

  def test_custom_output_writes_the_showcase_companion_next_to_it
    with_repository do |directory|
      exclude = File.join(directory, ".git", "info", "exclude")
      before = File.exist?(exclude) ? File.binread(exclude) : nil
      output = File.join(directory, "movie.mp4")

      result = generate(path: directory, output: output, renderer: FakeRenderer.new)

      assert_equal(output, result.output_path)
      assert_equal(File.join(directory, "movie.html"), result.showcase_path)
      assert(File.file?(result.showcase_path))
      after = File.exist?(exclude) ? File.binread(exclude) : nil
      assert_equal(before, after)
    end
  end

  def test_render_failure_keeps_the_showcase_and_cleans_the_temporary_file
    with_repository do |directory|
      renderer = FakeRenderer.new { raise RubyLens::Error, "Chrome could not initialize WebGL2" }

      error = assert_raises(RubyLens::Error) { generate(path: directory, renderer: renderer) }

      assert_includes(error.message, "Chrome could not initialize WebGL2")
      assert_includes(error.message, "the showcase HTML was still written to")
      assert(File.file?(File.join(directory, "rubylens-showcase.html")))
      refute(File.exist?(File.join(directory, "rubylens-clip.mp4")))
      assert_empty(Dir.glob(File.join(directory, ".rubylens-clip.mp4.*.tmp")))
    end
  end

  def test_missing_toolchain_fails_before_any_generation
    with_repository do |directory|
      RubyLens::Clip::Toolchain.expects(:chrome_path).raises(RubyLens::Error, "clip rendering needs Chrome or Chromium")

      error = assert_raises(RubyLens::Error) { generate(path: directory) }

      assert_includes(error.message, "needs Chrome or Chromium")
      refute(File.exist?(File.join(directory, "rubylens-showcase.html")))
      refute(File.exist?(File.join(directory, "rubylens-clip.mp4")))
    end
  end

  def test_clip_marker_detection_scans_head_and_tail
    Dir.mktmpdir("rubylens-clip-marker-") do |directory|
      generator = RubyLens::ClipGenerator.new
      head = File.join(directory, "head.mp4")
      File.binwrite(head, "x#{RubyLens::Clip::Renderer::MARKER_COMMENT}y")
      tail = File.join(directory, "tail.mp4")
      File.binwrite(tail, ("z" * (RubyLens::ClipGenerator::MARKER_SCAN_HEAD_BYTES + 16)) + RubyLens::Clip::Renderer::MARKER_COMMENT)
      other = File.join(directory, "other.mp4")
      File.binwrite(other, "plain video bytes")

      assert(generator.rubylens_clip?(head))
      assert(generator.rubylens_clip?(tail))
      refute(generator.rubylens_clip?(other))
      refute(generator.rubylens_clip?(File.join(directory, "missing.mp4")))
    end
  end

  private

  def with_repository
    Dir.mktmpdir("rubylens-clip-generator-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      yield directory
    end
  end

  def generate(**options)
    RubyLens::ClipGenerator.new(**options).call
  end
end
