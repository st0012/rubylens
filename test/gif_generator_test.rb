# frozen_string_literal: true

require_relative "test_helper"

class GifGeneratorTest < Minitest::Test
  def test_default_output_is_root_level_owner_only_and_locally_excluded
    with_repository do |directory|
      writer = fake_writer
      result = gif_generator(writer: writer).call(path: directory, duration: 1, fps: 2, width: 480, height: 270)

      expected = File.join(File.realpath(directory), "rubylens-galaxy.gif")
      assert_equal(expected, result.output_path)
      assert_equal(0o600, File.stat(expected).mode & 0o777)
      assert(system("git", "-C", directory, "check-ignore", "--quiet", expected))
      assert_equal(2, writer.last_options.fetch(:fps))
      assert_equal(2, writer.last_options.fetch(:prepared).fetch(:frame_count))
    end
  end

  def test_default_output_refuses_an_unrelated_existing_file
    with_repository do |directory|
      output = File.join(directory, "rubylens-galaxy.gif")
      File.write(output, "unrelated private file")

      error = assert_raises(RubyLens::Error) { gif_generator(writer: fake_writer).call(path: directory) }

      assert_equal("default GIF path already exists and is not a RubyLens export", error.message)
      assert_equal("unrelated private file", File.read(output))
    end
  end

  def test_custom_output_does_not_change_local_git_excludes
    with_repository do |directory|
      exclude = File.join(directory, ".git", "info", "exclude")
      before = File.binread(exclude)
      output = File.join(directory, "custom-galaxy.gif")

      result = gif_generator(writer: fake_writer).call(path: directory, output: output)

      assert_equal(output, result.output_path)
      assert_equal(before, File.binread(exclude))
      refute(system("git", "-C", directory, "check-ignore", "--quiet", output))
    end
  end

  def test_refuses_a_tracked_default_gif_with_a_gif_specific_error
    with_repository do |directory|
      output = File.join(directory, "rubylens-galaxy.gif")
      File.binwrite(output, "GIF89aRubyLens export;")
      system("git", "-C", directory, "add", "rubylens-galaxy.gif", exception: true)

      error = assert_raises(RubyLens::ExtractionError) do
        gif_generator(writer: fake_writer).call(path: directory)
      end

      assert_equal("default GIF path is already tracked by Git", error.message)
    end
  end

  def test_preflight_failure_does_not_index_or_change_local_excludes
    with_repository do |directory|
      exclude = File.join(directory, ".git", "info", "exclude")
      before = File.binread(exclude)
      generator_called = false
      generator = Object.new
      generator.define_singleton_method(:call) { |**| generator_called = true }
      writer = Object.new
      writer.define_singleton_method(:rubylens_gif?) { |_| false }
      writer.define_singleton_method(:preflight) { |**| raise RubyLens::Error, "missing capture tools" }

      error = assert_raises(RubyLens::Error) do
        RubyLens::GifGenerator.new(generator: generator, writer: writer).call(path: directory)
      end

      assert_equal("missing capture tools", error.message)
      refute(generator_called)
      assert_equal(before, File.binread(exclude))
    end
  end

  private

  def with_repository
    Dir.mktmpdir("rubylens-gif-generator-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      yield directory
    end
  end

  def gif_generator(writer:)
    generator = Object.new
    generator.define_singleton_method(:call) do |path:, output:, lockfile:|
      File.write(output, "private report for #{path} #{lockfile}")
      RubyLens::Result.new(output_path: output, counts: { "namespaces" => 3 }, warnings: [])
    end
    RubyLens::GifGenerator.new(generator: generator, writer: writer)
  end

  def fake_writer
    writer = Object.new
    writer.define_singleton_method(:rubylens_gif?) { |path| File.file?(path) && File.binread(path).include?("RubyLens export") }
    writer.define_singleton_method(:preflight) do |**options|
      options.merge(frame_count: (options.fetch(:duration) * options.fetch(:fps)).round)
    end
    writer.define_singleton_method(:write) do |report:, output:, **options|
      raise "missing private report" unless File.file?(report)

      @last_options = options
      File.binwrite(output, "GIF89aRubyLens export;")
      File.chmod(0o600, output)
      output
    end
    writer.define_singleton_method(:last_options) { @last_options }
    writer
  end
end
