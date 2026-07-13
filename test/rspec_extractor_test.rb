# frozen_string_literal: true

require_relative "test_helper"

class RSpecExtractorTest < Minitest::Test
  def test_propagates_malformed_method_reference_failures
    path = "/tmp/example/spec/example_spec.rb"
    manifest = Struct.new(:tracked_workspace_files) do
      def relative_workspace_path(_path)
        "spec/example_spec.rb"
      end
    end.new([path])
    reference = Object.new
    reference.define_singleton_method(:name) { raise "broken method reference" }
    document = Struct.new(:method_references).new([reference])
    graph = Object.new
    graph.define_singleton_method(:document) { |_uri| document }

    error = assert_raises(RuntimeError) do
      RubyLens::Index::RSpecExtractor.new.call(graph:, manifest:)
    end
    assert_equal("broken method reference", error.message)
  end
end
