# frozen_string_literal: true

require "base64"
require "digest/sha1"
require "securerandom"
require "socket"
require_relative "../errors"
require_relative "deadline_io"

module RubyLens
  module Clip
    # Minimal RFC 6455 client for Chrome's local DevTools WebSocket endpoint,
    # so clip rendering needs no gem or Node dependencies. Client frames are
    # masked text; ping, close, and fragmented server frames are handled;
    # extensions are never negotiated.
    class WebSocketChannel
      HANDSHAKE_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
      TEXT_OPCODE = 1
      CONTINUATION_OPCODE = 0
      CLOSE_OPCODE = 8
      PING_OPCODE = 9
      PONG_OPCODE = 10

      def initialize(host, port, path, timeout: 15)
        @socket = TCPSocket.new(host, port)
        @socket.setsockopt(Socket::IPPROTO_TCP, Socket::TCP_NODELAY, 1)
        @buffer = +"".b
        handshake(host, port, path, timeout)
      end

      def send_text(payload)
        bytes = payload.b
        length = bytes.bytesize
        header = if length < 126 then [0x80 | TEXT_OPCODE, 0x80 | length].pack("CC")
                 elsif length < 65_536 then [0x80 | TEXT_OPCODE, 0x80 | 126, length].pack("CCn")
                 else [0x80 | TEXT_OPCODE, 0x80 | 127, length].pack("CCQ>")
                 end
        mask = SecureRandom.bytes(4)
        @socket.write(header + mask + apply_mask(bytes, mask))
      rescue SystemCallError, IOError => error
        raise Error, "lost the Chrome DevTools connection: #{error.message}"
      end

      def read_text(timeout: 30)
        deadline = DeadlineIO.deadline(timeout)
        message = +"".b
        loop do
          finished, opcode, payload = read_frame(deadline)
          case opcode
          when TEXT_OPCODE, CONTINUATION_OPCODE then message << payload
          when CLOSE_OPCODE then raise Error, "Chrome closed the DevTools connection"
          when PING_OPCODE then send_control(PONG_OPCODE, payload)
          end
          return message.force_encoding(Encoding::UTF_8) if finished && opcode <= TEXT_OPCODE && !message.empty?
        end
      end

      def close
        @socket.close unless @socket.closed?
      rescue IOError
        nil
      end

      private

      def handshake(host, port, path, timeout)
        deadline = DeadlineIO.deadline(timeout)
        key = SecureRandom.base64(16)
        @socket.write("GET #{path} HTTP/1.1\r\nHost: #{host}:#{port}\r\n" \
                      "Upgrade: websocket\r\nConnection: Upgrade\r\n" \
                      "Sec-WebSocket-Key: #{key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        response = +"".b
        response << read_chunk(deadline) until response.include?("\r\n\r\n")
        head, _, rest = response.partition("\r\n\r\n")
        raise Error, "Chrome refused the DevTools WebSocket: #{head.lines.first&.strip}" unless head.start_with?("HTTP/1.1 101")

        expected = Base64.strict_encode64(Digest::SHA1.digest(key + HANDSHAKE_GUID))
        unless head.match?(/^sec-websocket-accept:\s*#{Regexp.escape(expected)}\s*$/i)
          raise Error, "Chrome DevTools WebSocket handshake failed verification"
        end

        @buffer << rest
      end

      def apply_mask(bytes, mask)
        masked = bytes.dup
        masked.bytesize.times { |index| masked.setbyte(index, masked.getbyte(index) ^ mask.getbyte(index % 4)) }
        masked
      end

      def send_control(opcode, payload)
        mask = SecureRandom.bytes(4)
        @socket.write([0x80 | opcode, 0x80 | payload.bytesize].pack("CC") + mask + apply_mask(payload, mask))
      end

      def read_frame(deadline)
        first, second = read_exact(2, deadline).unpack("CC")
        raise Error, "Chrome sent an invalid DevTools frame" if second.anybits?(0x80)

        length = second & 0x7F
        length = read_exact(2, deadline).unpack1("n") if length == 126
        length = read_exact(8, deadline).unpack1("Q>") if length == 127
        [first.anybits?(0x80), first & 0x0F, read_exact(length, deadline)]
      end

      def read_exact(length, deadline)
        @buffer << read_chunk(deadline) while @buffer.bytesize < length
        @buffer.slice!(0, length)
      end

      def read_chunk(deadline)
        DeadlineIO.read_chunk(@socket, deadline,
                              closed_message: "Chrome closed the DevTools connection",
                              timeout_message: "timed out waiting for Chrome")
      end
    end
  end
end
