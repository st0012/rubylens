# frozen_string_literal: true

require_relative "errors"
require_relative "git_repository"

module RubyLens
  # Safety policy shared by every generator's default output path: an existing
  # file is only replaced when the given check recognizes it as our own kind of
  # artifact, and the path plus its temporary-file pattern are added to the
  # repository's local Git excludes.
  module DefaultOutput
    module_function

    def resolve(root:, name:, description:)
      output = File.join(root, name)
      if File.exist?(output) && !yield(output)
        raise Error, "default #{description} path already exists and is not a RubyLens #{description}"
      end

      GitRepository.new(root).exclude_local(output, description: description)
      output
    end
  end
end
