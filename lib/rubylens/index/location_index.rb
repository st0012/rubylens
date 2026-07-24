# frozen_string_literal: true

require "set"
require_relative "source_path"

module RubyLens
  module Index
    # Answers the questions the collectors ask about a Rubydex location: which
    # file it names, whether that file is in the workspace, whether it is test
    # or core code, and which package owns it.
    #
    # Rubydex hands out a fresh wrapper and a fresh URI string on every call and
    # a codebase has far more definitions than files, so each answer is memoized
    # by URI. That memoization is why the collectors can afford to ask per
    # definition instead of hoisting the questions themselves.
    class LocationIndex
      # 1 for a file under a test directory, 0 for any other workspace file.
      TEST = 1
      CORE = 0
      TEST_SEGMENTS = %w[test tests spec specs feature features].freeze

      attr_reader :package_document_paths

      def initialize(manifest)
        @manifest = manifest
        @path_by_uri = {}
        @workspace_by_uri = {}
        @scope_by_uri = {}
        @package_index_by_uri = {}
        @package_document_paths = Set.new
      end

      # One sweep over the indexed documents resolves each URI once, recording
      # which of them belong to audited packages and returning the
      # [document, path] pairs so callers need not re-enumerate or re-parse.
      def resolve_documents(graph)
        audited = @manifest.packages.flat_map(&:files).to_set
        documents_with_paths = []
        graph.documents.each do |document|
          path = path_for(document.uri)
          next unless path

          documents_with_paths << [document, path]
          @package_document_paths << path if audited.include?(path)
        end
        documents_with_paths
      end

      def path_for(uri)
        @path_by_uri.fetch(uri) do
          @path_by_uri[uri] = SourcePath.from_file_uri(uri)
        end
      end

      def workspace?(location)
        uri = location.uri
        @workspace_by_uri.fetch(uri) do
          path = path_for(uri)
          @workspace_by_uri[uri] = path ? @manifest.workspace_path?(path) : false
        end
      rescue StandardError
        false
      end

      # TEST, CORE, or nil when the URI has no workspace-relative path.
      def scope_for(uri)
        @scope_by_uri.fetch(uri) do
          relative = @manifest.relative_workspace_path(path_for(uri))
          @scope_by_uri[uri] =
            if relative
              relative.split(File::SEPARATOR).any? { |segment| TEST_SEGMENTS.include?(segment) } ? TEST : CORE
            end
        end
      end

      # Package attribution is deliberately limited to documents Rubydex actually
      # indexed, so a path that merely sits inside a package root cannot claim it.
      def package_index_for(location)
        uri = location.uri
        @package_index_by_uri.fetch(uri) do
          path = path_for(uri)
          @package_index_by_uri[uri] =
            if path && @package_document_paths.include?(path)
              @manifest.package_index_for(path)
            end
        end
      end
    end
  end
end
