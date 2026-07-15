# frozen_string_literal: true

require_relative "test_helper"

class GeneratorTest < Minitest::Test
  def test_report_pipeline_requests_complete_dependency_rows
    pipeline = RubyLens::Generator.new.instance_variable_get(:@pipeline)
    adapter = pipeline.instance_variable_get(:@adapter)

    assert_nil(adapter.instance_variable_get(:@dependency_row_limit))
  end

  def test_generation_pipeline_builds_the_model_and_shared_warnings
    manifest = Struct.new(:warnings).new(["manifest warning"])
    manifest_builder = Object.new
    manifest_builder.define_singleton_method(:build) { |root:, lockfile:| manifest }
    adapter = Object.new
    adapter.define_singleton_method(:index) do |_manifest|
      { "warning_counts" => { "index" => 2, "integrity" => 1 } }
    end
    model_builder = Object.new
    model_builder.define_singleton_method(:build) { |_snapshot| { "totals" => { "namespaces" => 3 } } }

    model, warnings = RubyLens::GenerationPipeline.new(manifest_builder:, adapter:, model_builder:)
      .call(root: "/tmp/project", lockfile: "/tmp/Gemfile.lock")

    assert_equal({ "totals" => { "namespaces" => 3 } }, model)
    assert_equal(
      ["manifest warning", "Rubydex reported 2 indexing error(s).", "Rubydex reported 1 integrity issue(s)."],
      warnings,
    )
    assert_predicate(warnings, :frozen?)
  end

  def test_default_output_is_root_level_and_locally_excluded
    with_repository do |directory|
      result = generator.call(path: directory)

      assert_equal(File.join(File.realpath(directory), "rubylens-report.html"), result.output_path)
      assert(RubyLens::ReportWriter.new.rubylens_report?(result.output_path))
      assert(system("git", "-C", directory, "check-ignore", "--quiet", result.output_path))
    end
  end

  def test_default_output_refuses_an_unrelated_existing_file
    with_repository do |directory|
      output = File.join(directory, "rubylens-report.html")
      File.write(output, "unrelated private file")

      error = assert_raises(RubyLens::Error) { generator.call(path: directory) }

      assert_equal("default report path already exists and is not a RubyLens report", error.message)
      assert_equal("unrelated private file", File.read(output))
    end
  end

  def test_custom_output_does_not_change_local_git_excludes
    with_repository do |directory|
      exclude = File.join(directory, ".git", "info", "exclude")
      before = File.binread(exclude)
      output = File.join(directory, "custom-report.html")

      result = generator.call(path: directory, output: output)

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

  def generator
    manifest = Struct.new(:warnings).new([])
    manifest_builder = Object.new
    manifest_builder.define_singleton_method(:build) { |root:, lockfile:| manifest }
    adapter = Object.new
    adapter.define_singleton_method(:index) do |_manifest|
      { "warning_counts" => { "index" => 0, "integrity" => 0 } }
    end
    model_builder = Object.new
    model_builder.define_singleton_method(:build) { |_snapshot| { "totals" => { "namespaces" => 0 } } }
    RubyLens::Generator.new(manifest_builder: manifest_builder, adapter: adapter, model_builder: model_builder)
  end
end
