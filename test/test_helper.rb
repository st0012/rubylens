# frozen_string_literal: true

require "json"
require "minitest/autorun"
require "mocha/minitest"
require "pathname"
require "stringio"
require "tmpdir"
require "zlib"

require_relative "../lib/rubylens"
require_relative "../lib/rubylens/analyzer"
require_relative "../lib/rubylens/comparison"
require_relative "../lib/rubylens/mcp_probe"
require_relative "../lib/rubylens/overlay_builder"

module SnapshotHelpers
  ROOT = Pathname(__dir__).join("..").expand_path
  FIXTURE = ROOT.join("test/fixtures/tiny_repo")

  def gzip_payload(path)
    Zlib::GzipReader.open(path) { |gzip| JSON.parse(gzip.read).fetch("payload") }
  end
end
