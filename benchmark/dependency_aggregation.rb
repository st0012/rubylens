# frozen_string_literal: true

require "digest"
require "json"
require_relative "../lib/rubylens/model/dependency_aggregation"

declaration_count = Integer(ENV.fetch("DECLARATIONS", "200000"))
package_count = Integer(ENV.fetch("PACKAGES", "250"))
aggregation = RubyLens::Model::DependencyAggregation.new(package_count:)
GC.start
before_slots = GC.stat(:heap_live_slots)

started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
declaration_count.times do |index|
  package_index = index % package_count
  row = [index % 3, index % 128, 1 + index % 4, index % 4, index % 256, index % 512, index % 1024]
  aggregation.add(package_index:, row:, construct_index: index % 4)
end
elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at
GC.start
heap_live_slot_delta = GC.stat(:heap_live_slots) - before_slots

packages = aggregation.packages
retained_rows = packages.sum { |package| package.fetch(:declarations).length }
payload = Marshal.dump([packages, aggregation.signal_maxima])
exact_declaration_total = packages.sum { |package| package.fetch(:declaration_count) }
raise "declaration total changed" unless exact_declaration_total == declaration_count
raise "declaration rows were omitted" unless retained_rows == declaration_count

puts JSON.pretty_generate(
  declarations: declaration_count,
  packages: package_count,
  retained_rows: retained_rows,
  retention_ratio: retained_rows.fdiv(declaration_count),
  exact_declaration_total: exact_declaration_total,
  heap_live_slot_delta: heap_live_slot_delta,
  aggregate_bytes: payload.bytesize,
  elapsed_seconds: elapsed.round(3),
  deterministic_digest: Digest::SHA256.hexdigest(payload),
)
