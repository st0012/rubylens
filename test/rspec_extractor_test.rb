# frozen_string_literal: true

require "fileutils"
require "uri"
require_relative "test_helper"

class RSpecExtractorTest < Minitest::Test
  Location = Data.define(:uri, :start_line, :start_column, :end_line, :end_column) do
    def comparable_values
      [uri, start_line, start_column, end_line, end_column]
    end
  end
  Reference = Data.define(:name, :location)
  Document = Data.define(:uri, :method_references)

  def test_uses_only_indexed_workspace_ruby_documents_under_exact_spec_segments
    Dir.mktmpdir("rubylens-rspec-documents-") do |directory|
      root = Pathname(directory).join("workspace")
      external = Pathname(directory).join("dependency")
      included_a = write_file(root.join("spec/a_spec.rb"))
      included_z = write_file(root.join("specs/z_spec.rb"))
      unindexed = write_file(root.join("spec/unindexed_spec.rb"))
      false_segment = write_file(root.join("specification/not_a_spec.rb"))
      wrong_extension = write_file(root.join("spec/types.rbs"))
      wrong_directory = write_file(root.join("test/fake_spec.rb"))
      external_spec = write_file(external.join("spec/dependency_spec.rb"))
      escaping_symlink = root.join("spec/escaping_spec.rb")
      File.symlink(external_spec, escaping_symlink)

      documents = [
        document(external_spec, reference("describe", 1)),
        document(escaping_symlink, reference("describe", 1)),
        document(included_z, reference("context", 8), reference("it", 7)),
        Document.new("untitled:buffer", [reference("describe", 1)]),
        document(wrong_directory, reference("describe", 1)),
        document(wrong_extension, reference("describe", 1)),
        document(false_segment, reference("describe", 1)),
        document(included_a, reference("specify", 9), reference("context", 4), reference("describe", 2)),
        Document.new(file_uri(root.join("spec/missing_spec.rb")), [reference("describe", 1)]),
      ]
      graph = graph_with(documents)
      manifest = RubyLens::Index::Manifest.new(root:)
      manifest.define_singleton_method(:files) { [unindexed.to_s] }
      manifest.define_singleton_method(:workspace_files) { [unindexed.to_s] }

      result = RubyLens::Index::RSpecExtractor.new.call(graph:, manifest:)

      assert_equal(
        (1..3).map { |index| format("RSpec example group #%06d", index) },
        result.groups.map(&:name),
      )
      assert_equal(
        ["spec/a_spec.rb", "spec/a_spec.rb", "specs/z_spec.rb"],
        result.groups.map(&:component),
      )
      assert_equal(2, result.method_count)
    end
  end

  def test_sorts_references_by_rubydex_location_and_name
    references = [
      reference("context", 8, 3),
      reference("it", 4, 1),
      reference("context", 2, 5),
      reference("describe", 2, 5),
      reference("specify", 4, 0),
    ]

    groups, method_count = RubyLens::Index::RSpecExtractor.new.send(:references, references)

    assert_equal(
      [
        ["file:///test.rb", 2, 5, 2, 6, "context"],
        ["file:///test.rb", 2, 5, 2, 6, "describe"],
        ["file:///test.rb", 8, 3, 8, 4, "context"],
      ],
      groups,
    )
    assert_equal(2, method_count)
  end

  def test_propagates_malformed_method_reference_failures
    Dir.mktmpdir("rubylens-rspec-errors-") do |directory|
      root = Pathname(directory)
      path = write_file(root.join("spec/example_spec.rb"))
      broken_reference = Object.new
      broken_reference.define_singleton_method(:name) { raise "broken method reference" }
      graph = graph_with([document(path, broken_reference)])
      manifest = RubyLens::Index::Manifest.new(root:)

      error = assert_raises(RuntimeError) do
        RubyLens::Index::RSpecExtractor.new.call(graph:, manifest:)
      end
      assert_equal("broken method reference", error.message)
    end
  end

  private

  def document(path, *references)
    Document.new(file_uri(path), references)
  end

  def file_uri(path)
    "file://#{URI::RFC2396_PARSER.escape(path.to_s)}"
  end

  def graph_with(documents)
    Object.new.tap do |graph|
      graph.define_singleton_method(:documents) { documents.each }
      graph.define_singleton_method(:document) { |_uri| raise "Graph#document must not be called" }
    end
  end

  def reference(name, line, column = 0)
    Reference.new(name, Location.new("file:///test.rb", line, column, line, column + 1))
  end

  def write_file(path)
    FileUtils.mkdir_p(path.dirname)
    path.write("# indexed by test\n")
    path.realpath
  end
end
