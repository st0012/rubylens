# frozen_string_literal: true

module RubyLens
  # Recognizes RubyLens's own artifacts by scanning the head of a file for a
  # format marker, so default output paths are only ever replaced in kind.
  module ArtifactMarker
    HEAD_BYTES = 2048

    module_function

    def present?(path, marker, head_bytes: HEAD_BYTES)
      File.file?(path) && File.open(path, "rb") { |file| file.read(head_bytes).to_s.include?(marker) }
    rescue Errno::ENOENT, Errno::EACCES
      false
    end
  end
end
