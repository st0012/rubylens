# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require_relative "../lib/rubylens"

namespace_count = Integer(ENV.fetch("NAMESPACES", "100000"))
group_count = Integer(ENV.fetch("GROUPS", "1000"))
budget = Integer(ENV.fetch("BUDGET"))
raise "synthetic fixture requires positive groups" unless group_count.positive?
raise "synthetic fixture requires at least one namespace per group" if namespace_count < group_count

group_ids = group_count.times.map { |index| format("system-%04d", index) }
group_names = group_count.times.map { |index| format("Acme System %04d", index) }
weights = group_count.times.map { |index| 1 + (index % 41)**2 }
remaining_namespaces = namespace_count - group_count
weight_total = weights.sum
shares = weights.map { |weight| remaining_namespaces * weight.fdiv(weight_total) }
group_sizes = shares.map { |share| 1 + share.floor }
remainder_order = group_count.times.sort_by { |index| [-(shares[index] % 1), group_ids[index]] }
(namespace_count - group_sizes.sum).times { |rank| group_sizes[remainder_order.fetch(rank)] += 1 }
namespace_counts = Array.new(group_count) { Array.new(3, 0) }
group_ruby_counts = Array.new(group_count) do
  { "core" => Array.new(4, 0), "tests" => Array.new(4, 0) }
end
cross_group_counts = Array.new(group_count, 0)
names = Array.new(namespace_count)
rows = Array.new(namespace_count)

group_index = 0
group_offset = 0
namespace_count.times do |index|
  while group_offset >= group_sizes[group_index]
    group_index += 1
    group_offset = 0
  end
  scope = if (index % 10).zero?
    1
  elsif (index % 37).zero?
    2
  else
    0
  end
  kind = (index % 4).zero? ? 1 : 0
  ruby_counts = [kind.zero? ? 1 : 0, kind == 1 ? 1 : 0, 1 + index % 5, index % 3 == 0 ? 1 : 0]
  names[index] = format("Synthetic::System%04d::Namespace%06d", group_index, index)
  rows[index] = [
    group_index, kind, scope,
    index % 23, 1 + index % 5, index % 5, index % 31, index % 47, 1 + index % 53,
    *ruby_counts,
    kind.zero? ? index % 7 : 0,
  ]
  namespace_counts[group_index][scope] += 1
  category = scope == 1 ? "tests" : "core"
  ruby_counts.each_with_index { |count, metric| group_ruby_counts[group_index][category][metric] += count }
  cross_group_counts[group_index] += 1 if (index % 29).zero?
  group_offset += 1
end

groups = group_count.times.map do |index|
  id = group_ids[index]
  {
    "id" => id,
    "name" => group_names[index],
    "anchor_seed" => Digest::SHA256.digest("rubylens.group\0#{id}").unpack1("N"),
    "namespace_counts" => namespace_counts[index],
    "ruby_counts" => group_ruby_counts[index],
    "cross_group_namespaces" => cross_group_counts[index],
  }
end
category_stats = %w[core tests].to_h do |category|
  totals = Array.new(4, 0)
  group_ruby_counts.each do |counts|
    counts.fetch(category).each_with_index { |count, index| totals[index] += count }
  end
  [category, totals]
end

package_count = 64
dependency_count = RubyLens::Model::DependencyAggregation::DEFAULT_ROW_LIMIT
package_declarations = Array.new(package_count) { [] }
package_ruby_counts = Array.new(package_count) { Array.new(4, 0) }
dependency_count.times do |index|
  package_index = index % package_count
  package_declarations[package_index] << [index % 3, index % 17, 1 + index % 4, index % 4, index % 29, index % 41, index % 43]
  package_ruby_counts[package_index][index % 4] += 1
end
packages = package_count.times.map do |index|
  {
    "name" => format("synthetic-package-%02d", index),
    "role" => index < 8 ? 0 : 1,
    "location" => 1,
    "declaration_count" => package_declarations[index].length,
    "ruby_counts" => package_ruby_counts[index],
    "declarations" => package_declarations[index],
  }
end

snapshot = {
  "schema" => "rubylens.snapshot.v6",
  "explorer_layout" => ENV.fetch("EXPLORER_LAYOUT", "association"),
  "project_name" => "Synthetic Large Monorepo",
  "components" => namespace_counts.map(&:sum),
  "namespace_names" => names,
  "namespaces" => rows,
  "category_stats" => category_stats,
  "dependency_signal_maxima" => [16, 4, 3, 28, 40, 42],
  "groups" => groups,
  "packages" => packages,
  "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
}

GC.start
before_slots = GC.stat(:heap_live_slots)
started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
builder = RubyLens::ArtModelBuilder.new(seed: 0x51A7_E11A, namespace_budget: budget)
model = builder.build(snapshot)
model_elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at
art_json = JSON.generate(model)
showcase = RubyLens::ShowcaseModel.new.call(model)
showcase_json = JSON.generate(showcase)
GC.start
heap_live_slot_delta = GC.stat(:heap_live_slots) - before_slots

reordered = snapshot.merge(
  "namespace_names" => snapshot.fetch("namespace_names").reverse,
  "namespaces" => snapshot.fetch("namespaces").reverse,
)
reordered_digest = Digest::SHA256.hexdigest(JSON.generate(builder.build(reordered)))
art_digest = Digest::SHA256.hexdigest(art_json)

ranges = model.fetch("groupRanges")
quotas = ranges.map(&:last)
raise "quota sum mismatch" unless quotas.sum == [budget, namespace_count].min
raise "quota exceeds group size" unless quotas.each_with_index.all? { |quota, index| quota <= namespace_counts[index].sum }
raise "nonempty group lost" if budget >= group_count && quotas.any?(&:zero?)
raise "ranges are not contiguous" unless ranges.each_with_index.all? do |(first, length), index|
  first == ranges.take(index).sum(&:last) && model.fetch("namespaces").slice(first, length).all? { |row| row[1] == index }
end
raise "reordered input changed output" unless reordered_digest == art_digest
raise "LOD bounds are invalid" unless model.fetch("groupLods").each_with_index.all? do |(mid_length, near_length), index|
  near_length == ranges[index][1] && mid_length.between?(near_length.zero? ? 0 : 1, near_length)
end
raise "category representatives were lost" unless ranges.each_with_index.all? do |(first, length), index|
  core, tests, mixed = namespace_counts[index]
  source_categories = []
  source_categories << :core if core + mixed > 0
  source_categories << :tests if tests > 0
  selected_categories = model.fetch("namespaces").slice(first, length).map { |row| row[3] == 1 ? :tests : :core }.uniq
  (source_categories - selected_categories).empty?
end

core_totals = model.fetch("groups").each_with_object(Array.new(4, 0)) do |row, totals|
  row.slice(5, 4).each_with_index { |count, index| totals[index] += count }
end
test_totals = model.fetch("groups").each_with_object(Array.new(4, 0)) do |row, totals|
  row.slice(9, 4).each_with_index { |count, index| totals[index] += count }
end
raise "core aggregates do not reconcile" unless core_totals == category_stats.fetch("core")
raise "test aggregates do not reconcile" unless test_totals == category_stats.fetch("tests")

anchors = model.fetch("groupAnchors")
radii = model.fetch("groupRadii").map { |radius| radius / 1000.0 }
expected_radii = namespace_counts.map do |core, _tests, mixed|
  [[3.5 + Math.sqrt(core + mixed) * 0.55, 4.0].max, 16.0].min
end
raise "system radius transform mismatch" unless radii.zip(expected_radii).all? { |actual, expected| (actual - expected).abs < 0.001 }
raise "active anchor occupies the barycenter" if anchors.include?([0, 0, 0])
raise "active anchors are not centered" unless 3.times.all? { |axis| anchors.sum { |anchor| anchor[axis] }.zero? }
minimum_anchor_distance = Float::INFINITY
minimum_anchor_margin = Float::INFINITY
anchors.each_index do |left_index|
  (left_index + 1...anchors.length).each do |right_index|
    distance = Math.sqrt(anchors[left_index].zip(anchors[right_index]).sum { |a, b| (a - b)**2 })
    minimum_anchor_distance = [minimum_anchor_distance, distance].min
    minimum_anchor_margin = [minimum_anchor_margin, distance - radii[left_index] - radii[right_index]].min
  end
end
raise "system anchors overlap" unless minimum_anchor_margin > RubyLens::Model::GroupLayout::ASSOCIATION_GAP / 2
maximum_anchor_coordinate = anchors.flatten.map(&:abs).max || 0
private_tokens = [group_ids.first, group_ids[group_count / 2], group_ids.last,
  group_names.first, group_names[group_count / 2], group_names.last,
  names.first, names.last, packages.first.fetch("name")]
raise "Report omitted identity-bearing labels" unless group_names.first(2).all? { |token| art_json.include?(token) }
raise "Report retained group IDs" if [group_ids.first, group_ids[group_count / 2], group_ids.last].any? { |token| art_json.include?(token) }
raise "Showcase retained identity-bearing fields" if %w[groupNames namespaceNames packageNames].any? { |key| showcase.key?(key) }
raise "Showcase retained a private token" if private_tokens.any? { |token| showcase_json.include?(token) }

outputs = {}
if (output_directory = ENV["OUTPUT_DIR"])
  FileUtils.mkdir_p(output_directory)
  report_path = File.join(output_directory, "synthetic-monorepo-#{snapshot.fetch("explorer_layout")}-report.html")
  showcase_path = File.join(output_directory, "synthetic-monorepo-showcase.html")
  RubyLens::ReportWriter.new.write(model, output: report_path)
  RubyLens::ShowcaseWriter.new.write(showcase, output: showcase_path)
  outputs = { report: report_path, showcase: showcase_path }
end

result = {
  fixture: {
    synthetic: true,
    namespaces: namespace_count,
    groups: group_count,
    dependency_rows: dependency_count,
  },
  budget: budget,
  quotas: {
    sum: quotas.sum,
    minimum: quotas.min,
    maximum: quotas.max,
    represented_groups: quotas.count(&:positive?),
  },
  ranges: {
    count: ranges.length,
    contiguous: true,
    direct_slices_verified: true,
    nested_lods_verified: true,
  },
  anchors: {
    minimum_distance: minimum_anchor_distance.round(3),
    minimum_margin: minimum_anchor_margin.round(3),
    maximum_absolute_coordinate: maximum_anchor_coordinate,
    empty_barycenter: true,
  },
  radii: {
    transform: "clamp(3.5 + 0.55 * sqrt(core + mixed), 4.0, 16.0)",
    minimum: radii.min,
    maximum: radii.max,
  },
  aggregates_reconcile: true,
  deterministic_reordered_input: reordered_digest == art_digest,
  art: {
    schema: model.fetch("schema"),
    bytes: art_json.bytesize,
    digest: art_digest,
    rendered_namespaces: model.dig("totals", "renderedNamespaces"),
  },
  showcase: {
    schema: showcase.fetch("schema"),
    bytes: showcase_json.bytesize,
    anonymous_groups: true,
  },
  model_seconds: model_elapsed.round(3),
  heap_live_slot_delta: heap_live_slot_delta,
  outputs: outputs,
}
encoded_result = JSON.pretty_generate(result)
File.write(ENV.fetch("RESULT_PATH"), encoded_result) if ENV["RESULT_PATH"]
puts encoded_result
