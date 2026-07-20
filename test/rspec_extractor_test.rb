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
      manifest.stubs(files: [unindexed.to_s], workspace_files: [unindexed.to_s])

      result = RubyLens::Index::RSpecExtractor.new(graph:, manifest:).call

      assert_equal(
        (1..3).map { |index| format("RSpec example group #%06d", index) },
        result.groups,
      )
      assert_equal(2, result.method_count)
    end
  end

  def test_counts_references_without_reading_their_locations
    references = %w[context it context describe specify shared_examples].map do |name|
      reference = stub(name: name)
      reference.expects(:location).never
      reference
    end

    group_count, example_count = RubyLens::Index::RSpecExtractor.new(graph: nil, manifest: nil).send(:reference_counts, references)

    assert_equal(3, group_count)
    assert_equal(2, example_count)
  end

  def test_propagates_malformed_method_reference_failures
    Dir.mktmpdir("rubylens-rspec-errors-") do |directory|
      root = Pathname(directory)
      path = write_file(root.join("spec/example_spec.rb"))
      broken_reference = stub
      broken_reference.stubs(:name).raises("broken method reference")
      graph = graph_with([document(path, broken_reference)])
      manifest = RubyLens::Index::Manifest.new(root:)

      error = assert_raises(RuntimeError) do
        RubyLens::Index::RSpecExtractor.new(graph:, manifest:).call
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
    graph = stub(documents: documents.each)
    graph.expects(:document).never
    graph
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
