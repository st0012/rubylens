# frozen_string_literal: true

require "json"
require "minitest/autorun"
require "pathname"
require "tmpdir"
require "zlib"

require_relative "../lib/rubylens"

module SnapshotHelpers
  ROOT = Pathname(__dir__).join("..").expand_path
  FIXTURE = ROOT.join("test/fixtures/tiny_repo")

  def gzip_payload(path)
    Zlib::GzipReader.open(path) { |gzip| JSON.parse(gzip.read).fetch("payload") }
  end
end
