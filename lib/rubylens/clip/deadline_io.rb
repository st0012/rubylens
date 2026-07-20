# frozen_string_literal: true

require_relative "../errors"

module RubyLens
  module Clip
    # Deadline-bounded, non-blocking socket reads shared by the DevTools
    # WebSocket channel and the local DevTools HTTP client.
    module DeadlineIO
      module_function

      def monotonic = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      def deadline(timeout) = monotonic + timeout

      def read_chunk(socket, deadline, closed_message:, timeout_message:)
        remaining = deadline - monotonic
        raise Error, timeout_message if remaining <= 0
        IO.select([socket], nil, nil, remaining) or raise Error, timeout_message
        chunk = socket.read_nonblock(1 << 20, exception: false)
        raise Error, closed_message if chunk.nil?
        chunk.is_a?(String) ? chunk : "".b
      rescue SystemCallError, IOError => error
        raise Error, "#{closed_message}: #{error.message}"
      end
    end
  end
end
