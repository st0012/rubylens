# frozen_string_literal: true

require_relative "test_helper"

class GeneratorTest < Minitest::Test
  def test_generation_pipeline_builds_a_model_and_shared_manifest_warnings
    with_repository do |directory|
      model, warnings = RubyLens::GenerationPipeline.new(root: directory).call

      assert_equal("rubylens.art.v13", model.fetch("schema"))
      assert_equal(0, model.dig("totals", "namespaces"))
      assert_equal(["No Gemfile.lock found; dependency systems were omitted."], warnings)
      assert_predicate(warnings, :frozen?)
    end
  end

  def test_default_output_is_root_level_and_locally_excluded
    with_repository do |directory|
      result = generate(path: directory)

      assert_equal(File.join(File.realpath(directory), "rubylens-report.html"), result.output_path)
      assert(RubyLens::ArtifactMarker.present?(result.output_path, RubyLens::ReportWriter::MARKER))
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

  def test_json_output_is_a_stitchable_explorer_artifact
    Dir.mktmpdir("rubylens-generator-json-") do |directory|
      output = File.join(directory, "tiny.rubylens.json")

      result = generate(path: SnapshotHelpers::FIXTURE, output: output, output_format: "json")
      artifact = RubyLens::ExplorerArtifact.read(output)

      assert_equal(File.expand_path(output), result.output_path)
      assert_equal("Tiny Repo", artifact.galaxy.fetch("projectName"))
      assert_equal("rubylens.art.v13", artifact.galaxy.fetch("schema"))
      assert_equal(result.counts, artifact.galaxy.fetch("totals"))
      assert_equal(result.warnings, artifact.warnings)
    end
  end

  def test_default_json_output_is_root_level_and_locally_excluded
    with_repository do |directory|
      result = generate(path: directory, output_format: "json")

      assert_equal(File.join(File.realpath(directory), RubyLens::ExplorerArtifact::DEFAULT_NAME), result.output_path)
      assert(RubyLens::ExplorerArtifact.owned?(result.output_path))
      assert(system("git", "-C", directory, "check-ignore", "--quiet", result.output_path))
    end
  end

  def test_default_json_output_refuses_an_unrelated_existing_file
    with_repository do |directory|
      output = File.join(directory, RubyLens::ExplorerArtifact::DEFAULT_NAME)
      File.binwrite(output, "unrelated private file")

      error = assert_raises(RubyLens::Error) do
        generate(path: directory, output_format: "json")
      end

      assert_equal("default explorer artifact path already exists and is not a RubyLens explorer artifact", error.message)
      assert_equal("unrelated private file", File.binread(output))
    end
  end

  def test_rejects_unknown_explorer_output_formats_before_indexing
    error = assert_raises(RubyLens::Error) do
      generate(path: SnapshotHelpers::FIXTURE, output_format: "yaml")
    end

    assert_equal("unsupported Explorer output format: yaml", error.message)
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
