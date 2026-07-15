# frozen_string_literal: true

require "json"
require "minitest/autorun"
require "mocha/minitest"
require "pathname"
require "stringio"
require "tmpdir"

require_relative "../lib/rubylens"

module SnapshotHelpers
  ROOT = Pathname(__dir__).join("..").expand_path
  FIXTURE = ROOT.join("test/fixtures/tiny_repo")
end
