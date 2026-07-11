# frozen_string_literal: true

require_relative "test_helper"

class ShowcaseGeneratorTest < Minitest::Test
  def test_default_output_is_root_level_private_and_locally_excluded
    with_repository do |directory|
      result = generator.call(path: directory)
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

      error = assert_raises(RubyLens::Error) { generator.call(path: directory) }

      assert_equal("default showcase path already exists and is not a RubyLens showcase", error.message)
      assert_equal("unrelated private file", File.read(output))
    end
  end

  def test_custom_output_does_not_change_local_git_excludes
    with_repository do |directory|
      exclude = File.join(directory, ".git", "info", "exclude")
      before = File.binread(exclude)
      output = File.join(directory, "custom-showcase.html")

      result = generator.call(path: directory, output: output)

      assert_equal(output, result.output_path)
      assert_equal(before, File.binread(exclude))
      refute(system("git", "-C", directory, "check-ignore", "--quiet", output))
    end
  end

  def test_refuses_a_tracked_default_showcase_before_indexing
    with_repository do |directory|
      output = File.join(directory, "rubylens-showcase.html")
      File.write(output, '<meta name="rubylens-artifact" content="showcase">')
      system("git", "-C", directory, "add", "rubylens-showcase.html", exception: true)

      error = assert_raises(RubyLens::ExtractionError) { generator.call(path: directory) }

      assert_equal("default showcase path is already tracked by Git", error.message)
      refute(@indexed)
    end
  end

  private

  def with_repository
    Dir.mktmpdir("rubylens-showcase-generator-") do |directory|
      system("git", "-C", directory, "init", "--quiet", exception: true)
      yield directory
    end
  end

  def generator
    @indexed = false
    manifest = Struct.new(:warnings).new([])
    manifest_builder = Object.new
    manifest_builder.define_singleton_method(:build) { |root:, lockfile:, configuration:| manifest }
    adapter = Object.new
    owner = self
    adapter.define_singleton_method(:index) do |_manifest|
      owner.instance_variable_set(:@indexed, true)
      { "warning_counts" => { "index" => 0, "integrity" => 0 } }
    end
    model_builder = Object.new
    model_builder.define_singleton_method(:build) do |_snapshot|
      {
        "projectName" => "Synthetic App",
        "totals" => { "namespaces" => 0, "packages" => 0, "dependencyStars" => 0, "renderedDependencyStars" => 0 },
        "domains" => RubyLens::ArtModelBuilder::SIGNAL_FIELDS.to_h { |field| [field, 0] },
        "categoryStats" => { "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] },
        "namespaces" => [], "packages" => [], "dependencyStars" => [],
      }
    end
    RubyLens::ShowcaseGenerator.new(manifest_builder:, adapter:, model_builder:)
  end
end
