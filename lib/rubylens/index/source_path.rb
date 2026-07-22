# frozen_string_literal: true

require "uri"

module RubyLens
  module Index
    # Maps Rubydex document and location URIs back to workspace source paths.
    module SourcePath
      # The canonical shape Rubydex emits: an empty authority and a
      # percent-encoded absolute path built from RFC 2396 path characters.
      # Anything else falls back to full URI parsing below.
      ENCODED_FILE_URI = %r{\Afile://(/(?:[A-Za-z0-9\-_.!~*'()/:@&=+$,;]|%[0-9A-Fa-f]{2})*)\z}

      module_function

      # Rubydex 0.2.9 percent-encodes file URIs and Location#to_file_path
      # returns the path still encoded, so decode the URI ourselves.
      def from_file_uri(uri_string)
        match = ENCODED_FILE_URI.match(uri_string)
        if match
          path = match[1]
          path = URI::RFC2396_PARSER.unescape(path) if path.include?("%")
          path = path.delete_prefix("/") if Gem.win_platform?
          return path
        end

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
