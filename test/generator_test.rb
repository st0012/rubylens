# frozen_string_literal: true

require_relative "test_helper"

class GeneratorTest < Minitest::Test
  def test_generation_pipeline_builds_a_model_and_shared_manifest_warnings
    with_repository do |directory|
      model, warnings = RubyLens::GenerationPipeline.new(root: directory).call

      assert_equal("rubylens.art.v10", model.fetch("schema"))
      assert_equal(0, model.dig("totals", "namespaces"))
      assert_equal(["No Gemfile.lock found; dependency systems were omitted."], warnings)
      assert_predicate(warnings, :frozen?)
    end
  end

  def test_default_output_is_root_level_and_locally_excluded
    with_repository do |directory|
      result = generate(path: directory)

      assert_equal(File.join(File.realpath(directory), "rubylens-report.html"), result.output_path)
      assert(RubyLens::ReportWriter.new.rubylens_report?(result.output_path))
      assert(system("git", "-C", directory, "check-ignore", "--quiet", result.output_path))
    end
  end

  def test_default_output_refuses_an_unrelated_existing_file
    with_repository do |directory|
      output = File.join(directory, "rubylens-report.html")
      File.write(output, "unrelated private file")

      error = assert_raises(RubyLens::Error) { generate(path: directory) }

      assert_equal("default report path already exists and is not a RubyLens report", error.message)
      assert_equal("unrelated private file", File.read(output))
    end
  end

  def test_custom_output_does_not_change_local_git_excludes
    with_repository do |directory|
      exclude = File.join(directory, ".git", "info", "exclude")
      before = File.binread(exclude)
      output = File.join(directory, "custom-report.html")

      result = generate(path: directory, output: output)

      assert_equal(output, result.output_path)
      assert_equal(before, File.binread(exclude))
      refute(system("git", "-C", directory, "check-ignore", "--quiet", output))
    end
  end

  private

  def with_repository
    Dir.mktmpdir("rubylens-generator-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      yield directory
    end
  end

  def generate(**options)
    RubyLens::Generator.new(**options).call
  end
end
