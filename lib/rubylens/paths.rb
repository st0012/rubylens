# frozen_string_literal: true

module RubyLens
  module Paths
    module_function

    def inside?(path, directory)
      path = File.expand_path(path)
      directory = File.expand_path(directory)
      path == directory || path.start_with?("#{directory}#{File::SEPARATOR}")
    end
  end
end
