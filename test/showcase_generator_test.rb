# frozen_string_literal: true

require "base64"
require_relative "test_helper"

class ShowcaseGeneratorTest < Minitest::Test
  def test_default_output_is_root_level_private_and_locally_excluded
    with_repository do |directory|
      result = generate(path: directory)
      expected = File.join(File.realpath(directory), "rubylens-showcase.html")

      assert_equal(expected, result.output_path)
      assert_equal(0o600, File.stat(expected).mode & 0o777)
      assert(RubyLens::ShowcaseWriter.new.rubylens_showcase?(expected))
      assert(system("git", "-C", directory, "check-ignore", "--quiet", expected))
      exclude = File.read(File.join(directory, ".git", "info", "exclude"))
      assert_includes(exclude, "/rubylens-showcase.html")
      assert_includes(exclude, "/.rubylens-showcase.html.*.tmp")
    end
  end

  def test_default_output_refuses_an_unrelated_existing_file
    with_repository do |directory|
      output = File.join(directory, "rubylens-showcase.html")
      File.write(output, "unrelated private file")

      error = assert_raises(RubyLens::Error) { generate(path: directory) }

      assert_equal("default showcase path already exists and is not a RubyLens showcase", error.message)
      assert_equal("unrelated private file", File.read(output))
    end
  end

  def test_custom_output_does_not_change_local_git_excludes
    with_repository do |directory|
      exclude = File.join(directory, ".git", "info", "exclude")
      before = File.binread(exclude)
      output = File.join(directory, "custom-showcase.html")

      result = generate(path: directory, output: output)

      assert_equal(output, result.output_path)
      assert_equal(before, File.binread(exclude))
      refute(system("git", "-C", directory, "check-ignore", "--quiet", output))
    end
  end

  def test_details_opt_in_reaches_the_serialized_showcase_model
    with_repository do |directory|
      result = generate(path: directory, details: true)
      encoded = File.read(result.output_path).match(/JSON\.parse\(atob\("([^"]+)"\)\)/)[1]
      model = JSON.parse(Base64.strict_decode64(encoded))

      assert_equal(true, model.fetch("details"))
      assert_equal("rubylens.showcase.v4", model.fetch("schema"))
      assert_equal(10, model.fetch("morphology").length)
      assert_equal(model.fetch("packages").length, model.fetch("packageMorphologies").length)
      assert(model.key?("totals"))
      assert(model.key?("annotations"))
    end
  end

  def test_refuses_a_tracked_default_showcase
    with_repository do |directory|
      output = File.join(directory, "rubylens-showcase.html")
      File.write(output, '<meta name="rubylens-artifact" content="showcase">')
      system("git", "-C", directory, "add", "rubylens-showcase.html", exception: true)

      error = assert_raises(RubyLens::GitError) { generate(path: directory) }

      assert_equal("default showcase path is already tracked by Git", error.message)
      assert_equal('<meta name="rubylens-artifact" content="showcase">', File.read(output))
    end
  end

  private

  def with_repository
    Dir.mktmpdir("rubylens-showcase-generator-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      yield directory
    end
  end

  def generate(**options)
    RubyLens::ShowcaseGenerator.new(**options).call
  end
end
