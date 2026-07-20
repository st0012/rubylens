# frozen_string_literal: true

require "uri"

module RubyLens
  module Index
    # Maps Rubydex document and location URIs back to workspace source paths.
    module SourcePath
      module_function

      # Rubydex 0.2.9 percent-encodes file URIs and Location#to_file_path
      # returns the path still encoded, so decode the URI ourselves.
      def from_file_uri(uri_string)
        uri = URI.parse(uri_string)
        return unless uri.scheme == "file"
        return if uri.host && !uri.host.empty? && uri.host != "localhost"
        return unless uri.path

        path = URI::RFC2396_PARSER.unescape(uri.path)
        path = path.delete_prefix("/") if Gem.win_platform?
        path
      rescue URI::InvalidURIError
        nil
      end
    end
  end
end
