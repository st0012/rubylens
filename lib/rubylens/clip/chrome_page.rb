# frozen_string_literal: true

require "base64"
require "fileutils"
require "json"
require "socket"
require "tmpdir"
require "uri"
require_relative "../errors"
require_relative "deadline_io"
require_relative "web_socket_channel"

module RubyLens
  module Clip
    # Runs a headless Chrome/Chromium with an ephemeral DevTools port and a
    # throwaway profile, attaches to the page that loads the showcase HTML,
    # and exposes the two operations clip rendering needs: evaluate and
    # screenshot. The port comes from the profile's DevToolsActivePort file,
    # so parallel clips never race for a fixed port.
    class ChromePage
      HEADLESS_FLAGS = %w[
        --headless=new
        --remote-debugging-port=0
        --no-first-run
        --no-default-browser-check
        --disable-background-networking
        --disable-component-update
        --disable-sync
        --mute-audio
        --hide-scrollbars
        --force-device-scale-factor=1
        --force-color-profile=srgb
        --enable-unsafe-swiftshader
      ].freeze
      LAUNCH_TIMEOUT_SECONDS = 30

      def self.open(executable:, url:, width:, height:)
        page = new(executable:, url:, width:, height:)
        begin
          yield page
        ensure
          page.close
        end
      end

      def initialize(executable:, url:, width:, height:)
        @profile = Dir.mktmpdir("rubylens-clip-")
        @next_id = 0
        @responses = {}
        flags = HEADLESS_FLAGS.dup
        # Chrome refuses its sandbox as root (typical for containers and CI).
        flags << "--no-sandbox" if Process.euid.zero?
        flags << "--window-size=#{width},#{height}"
        flags << "--user-data-dir=#{@profile}"
        @pid = Process.spawn(executable, *flags, url, %i[out err] => File::NULL)
        port = wait_for_devtools_port
        @channel = WebSocketChannel.new("127.0.0.1", port, page_target_path(port))
        # The headless window includes non-viewport space; pin the viewport so
        # captures are exactly the stage size.
        command("Emulation.setDeviceMetricsOverride", {
          "width" => width, "height" => height, "deviceScaleFactor" => 1, "mobile" => false
        }, timeout: 30)
      rescue Errno::ENOENT => error
        abort_start
        raise Error, "could not launch Chrome at #{executable}: #{error.message}"
      rescue SystemCallError => error
        # A startup race (Chrome exiting or closing its port mid-attach) must
        # surface as a normal rubylens error, not a raw Errno stack trace.
        abort_start
        raise Error, "could not attach to Chrome's DevTools endpoint: #{error.message}"
      rescue StandardError
        abort_start
        raise
      end

      def evaluate(expression, await: false, timeout: 30)
        result = command("Runtime.evaluate", {
          "expression" => expression,
          "returnByValue" => true,
          "awaitPromise" => await,
        }, timeout:)
        if (details = result["exceptionDetails"])
          raise Error, "the showcase page raised: #{details.dig("exception", "description") || details["text"]}"
        end
        result.dig("result", "value")
      end

      def screenshot_png(timeout: 60)
        data = command("Page.captureScreenshot", { "format" => "png", "optimizeForSpeed" => true }, timeout:)
        Base64.decode64(data.fetch("data"))
      end

      def close
        begin
          command("Browser.close", {}, timeout: 3) if @channel
        rescue Error
          terminate
        end
        Process.wait(@pid) if @pid
      rescue Errno::ECHILD
        nil
      ensure
        @channel&.close
        FileUtils.remove_entry(@profile) if @profile && File.directory?(@profile)
      end

      private

      # A failed start never reaches ChromePage.open's ensure, so the spawned
      # browser and throwaway profile must be cleaned up before re-raising.
      def abort_start
        terminate if @pid
        begin
          Process.wait(@pid) if @pid
        rescue Errno::ECHILD
          nil
        end
        @channel&.close
        FileUtils.remove_entry(@profile) if @profile && File.directory?(@profile)
      end

      def terminate
        Process.kill("KILL", @pid)
      rescue Errno::ESRCH
        nil
      end

      def command(method, params, timeout:)
        id = (@next_id += 1)
        @channel.send_text(JSON.generate({ "id" => id, "method" => method, "params" => params }))
        loop do
          if (message = @responses.delete(id))
            if (error = message["error"])
              raise Error, "Chrome rejected #{method}: #{error["message"]}"
            end
            return message.fetch("result")
          end
          message = JSON.parse(@channel.read_text(timeout:))
          @responses[message["id"]] = message if message["id"]
        end
      end

      def wait_for_devtools_port
        port_path = File.join(@profile, "DevToolsActivePort")
        deadline = DeadlineIO.deadline(LAUNCH_TIMEOUT_SECONDS)
        while DeadlineIO.monotonic < deadline
          if File.exist?(port_path)
            port = File.read(port_path).lines.first.to_i
            return port if port.positive?
          end
          if Process.waitpid(@pid, Process::WNOHANG)
            @pid = nil
            raise Error, "Chrome exited while starting up; it may not support headless rendering here"
          end
          sleep 0.05
        end
        raise Error, "Chrome did not publish a DevTools port within #{LAUNCH_TIMEOUT_SECONDS} seconds"
      end

      def page_target_path(port)
        deadline = DeadlineIO.deadline(LAUNCH_TIMEOUT_SECONDS)
        while DeadlineIO.monotonic < deadline
          begin
            target = JSON.parse(http_get(port, "/json/list")).find { |info| info["type"] == "page" }
            if (socket_url = target&.fetch("webSocketDebuggerUrl", nil))
              return URI(socket_url).path
            end
          rescue Error, SystemCallError, JSON::ParserError
            # The HTTP endpoint can lag DevToolsActivePort; retry until the deadline.
          end
          sleep 0.05
        end
        raise Error, "Chrome never exposed the showcase page for capture"
      end

      # Deliberately hand-rolled: Net::HTTP can route through proxy environment
      # variables, and this endpoint is always a local loopback.
      def http_get(port, path, timeout: 10)
        deadline = DeadlineIO.deadline(timeout)
        socket = TCPSocket.new("127.0.0.1", port)
        socket.write("GET #{path} HTTP/1.1\r\nHost: 127.0.0.1:#{port}\r\nConnection: close\r\n\r\n")
        response = +"".b
        response << read_http_chunk(socket, deadline) until response.include?("\r\n\r\n")
        head, _, body = response.partition("\r\n\r\n")
        length = head[/^content-length:\s*(\d+)/i, 1]&.to_i
        raise Error, "Chrome's DevTools endpoint sent an unexpected response" unless length

        body = body.b
        body << read_http_chunk(socket, deadline) while body.bytesize < length
        body.byteslice(0, length)
      ensure
        socket&.close
      end

      def read_http_chunk(socket, deadline)
        DeadlineIO.read_chunk(socket, deadline,
                              closed_message: "Chrome closed its DevTools endpoint early",
                              timeout_message: "timed out talking to Chrome's DevTools endpoint")
      end
    end
  end
end
