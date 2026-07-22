# frozen_string_literal: true

require_relative "test_helper"

class RubydexAdapterTest < Minitest::Test
  include SnapshotHelpers

  RSPEC_FIXTURE = ROOT.join("test/fixtures/rspec_repo")

  def test_collects_every_eligible_dependency_row
    location_class = Data.define(:uri) do
      def comparable_values = [uri, 0, 0, 0, 1]
    end
    definition_class = Data.define(:location)
    declaration_class = Data.define(:name, :definitions, :references)
    paths = ["/deps/alpha/lib/alpha.rb", "/deps/beta/lib/beta.rb"]
    declarations = 30.times.map do |index|
      declaration_class.new(
        "Dependency#{index}",
        [definition_class.new(location_class.new("file://#{paths.fetch(index % 2)}"))],
        Array.new(index % 7),
      )
    end
    manifest = stub(packages: [Object.new, Object.new], workspace_path?: false)
    manifest.stubs(:package_index_for).with(paths.fetch(0)).returns(0)
    manifest.stubs(:package_index_for).with(paths.fetch(1)).returns(1)
    adapter = RubyLens::Index::RubydexAdapter.new(manifest)
    adapter.instance_variable_set(:@indexed_package_document_paths, Set.new(paths))

    collected = adapter.send(:collect_declarations, declarations)
    packages = collected.fetch(:dependency_packages)

    assert_equal(30, packages.sum { |package| package.fetch(:declarations).length })
    assert_equal([15, 15], packages.map { |package| package.fetch(:declarations).length })
    assert_equal([0, 1, 0, 0, 6, 0], collected.fetch(:dependency_signal_maxima))
  end

  def test_real_adapter_returns_hover_identity_without_paths_or_source
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
    serialized = JSON.generate(snapshot)

    assert_equal("rubylens.snapshot.v9", snapshot.fetch("schema"))
    assert_equal("Tiny Repo", snapshot.fetch("project_name"))
    assert_equal(9, snapshot.fetch("namespaces").length)
    assert_equal(9, snapshot.fetch("namespace_names").length)
    assert(snapshot.fetch("namespaces").all? { |row| row.length == 13 && row.all?(Integer) })
    assert_equal({ "core" => [4, 4, 3, 1], "tests" => [1, 0, 0, 0] }, snapshot.fetch("category_stats"))
    assert_equal(6, snapshot.fetch("dependency_signal_maxima").length)
    assert_empty(snapshot.fetch("dependency_systems"))
    assert_includes(snapshot.fetch("namespace_names"), "Demo::Order")
    order_index = snapshot.fetch("namespace_names").index("Demo::Order")
    assert_equal([1, 0, 2, 1, 1], snapshot.fetch("namespaces").fetch(order_index).last(5))
    helper_index = snapshot.fetch("namespace_names").index("Demo::Helper")
    links = snapshot.fetch("constant_reference_links")
    namespace_count = snapshot.fetch("namespaces").length
    assert_equal(1, links.count([order_index, helper_index]))
    assert_equal(links.uniq, links)
    assert(links.all? { |row| row.length == 2 && row.all?(Integer) })
    assert(links.all? do |referring_index, referenced_index|
      referring_index.between?(0, namespace_count - 1) &&
        referenced_index.between?(0, namespace_count - 1)
    end)
    order_test_index = snapshot.fetch("namespace_names").index("Demo::OrderTest")
    assert_equal(0, snapshot.fetch("namespaces").fetch(order_test_index).last)
    refute_includes(serialized, FIXTURE.to_s)
    refute_includes(serialized, "domain.rb")
    refute_includes(serialized, "PRIVATE_VALUE")
  end

  def test_constant_reference_links_use_workspace_origins_and_exact_namespace_or_dependency_targets
    Dir.mktmpdir("rubylens-reference-links-") do |directory|
      workspace = Pathname(directory).join("workspace")
      dependency = Pathname(directory).join("dependency-a")
      second_dependency = Pathname(directory).join("dependency-b")
      workspace.mkpath
      dependency.mkpath
      second_dependency.mkpath
      workspace = workspace.realpath
      dependency = dependency.realpath
      second_dependency = second_dependency.realpath
      workspace_source = workspace.join("source.rb")
      test_source = workspace.join("test/source_test.rb")
      dependency_source = dependency.join("source.rb")
      second_dependency_source = second_dependency.join("source.rb")
      test_source.dirname.mkpath
      workspace_source.write(<<~RUBY)
        class Target
        end

        class Outer
          class Inner
            FIRST = Target
            SECOND = Target
            SELF_REFERENCE = Inner
            UNRESOLVED_REFERENCE = MissingTarget
          end
        end

        class UsesDependency
          REFERENCE = DependencyTarget
        end

        TOP_LEVEL_REFERENCE = Target
      RUBY
      test_source.write(<<~RUBY)
        class TestUsesDependency
          REFERENCE = DependencyTarget
        end
      RUBY
      dependency_source.write(<<~RUBY)
        class DependencyTarget
        end

        class DependencyReferrer
          def self.workspace_reference
            Target
          end

          def self.test_reference
            TestUsesDependency
          end

          INTERNAL_REFERENCE = DependencyTarget
          CROSS_DEPENDENCY_REFERENCE = DependencyCrossTarget
        end
      RUBY
      second_dependency_source.write(<<~RUBY)
        class DependencyCrossTarget
        end
      RUBY
      manifest = Object.new
      manifest.define_singleton_method(:workspace_path?) do |path|
        RubyLens::Paths.inside?(path, workspace)
      end
      manifest.define_singleton_method(:relative_workspace_path) do |path|
        Pathname(path).relative_path_from(workspace).to_s
      end
      manifest.define_singleton_method(:packages) { [Object.new, Object.new] }
      manifest.define_singleton_method(:package_index_for) do |path|
        resolved = Pathname(path).realpath
        if resolved == dependency_source.realpath
          0
        elsif resolved == second_dependency_source.realpath
          1
        end
      rescue Errno::ENOENT
        nil
      end
      adapter = RubyLens::Index::RubydexAdapter.new(manifest)
      graph = Rubydex::Graph.new(workspace_path: workspace.to_s)
      assert_empty(graph.index_all([workspace_source.to_s, test_source.to_s, dependency_source.to_s, second_dependency_source.to_s]))
      graph.resolve
      adapter.instance_variable_set(
        :@indexed_package_document_paths,
        Set[dependency_source.realpath.to_s, second_dependency_source.realpath.to_s],
      )
      references = graph.constant_references.to_a
      same_dependency_reference = references.find do |reference|
        reference.is_a?(Rubydex::ResolvedConstantReference) &&
          reference.declaration.name == "DependencyTarget" &&
          RubyLens::Index::SourcePath.from_file_uri(reference.location.uri) == dependency_source.to_s
      end
      cross_dependency_reference = references.find do |reference|
        reference.is_a?(Rubydex::ResolvedConstantReference) &&
          reference.declaration.name == "DependencyCrossTarget" &&
          RubyLens::Index::SourcePath.from_file_uri(reference.location.uri) == dependency_source.to_s
      end
      workspace_target_from_dependency = references.find do |reference|
        reference.is_a?(Rubydex::ResolvedConstantReference) &&
          reference.declaration.name == "Target" &&
          RubyLens::Index::SourcePath.from_file_uri(reference.location.uri) == dependency_source.to_s
      end
      test_target_from_dependency = references.find do |reference|
        reference.is_a?(Rubydex::ResolvedConstantReference) &&
          reference.declaration.name == "TestUsesDependency" &&
          RubyLens::Index::SourcePath.from_file_uri(reference.location.uri) == dependency_source.to_s
      end
      unresolved_reference = references.find do |reference|
        reference.is_a?(Rubydex::UnresolvedConstantReference) && reference.name == "MissingTarget"
      end
      assert(same_dependency_reference)
      assert(cross_dependency_reference)
      assert(workspace_target_from_dependency)
      assert(test_target_from_dependency)
      assert(unresolved_reference)
      collected = adapter.send(:collect_declarations, graph.declarations)
      namespaces = adapter.send(
        :workspace_namespaces,
        collected.fetch(:workspace_records),
        [],
        collected.fetch(:workspace_definition_ranges),
      )

      summary = adapter.send(
        :workspace_reference_summary,
        graph,
        namespaces,
        collected.fetch(:dependency_ordinal_by_name),
      )
      ordinals = namespaces.fetch(:ordinal_by_name)
      dependency_ordinals = collected.fetch(:dependency_ordinal_by_name)
      dependency_target = dependency_ordinals.fetch("DependencyTarget")
      dependency_endpoint = namespaces.fetch(:namespace_names).length + dependency_target

      assert_equal(
        Set[
          [ordinals.fetch("Outer::Inner"), ordinals.fetch("Target")],
          [ordinals.fetch("UsesDependency"), dependency_endpoint],
          [ordinals.fetch("TestUsesDependency"), dependency_endpoint],
        ],
        summary.links.to_set,
      )
      assert_equal(3, summary.inbound_counts.fetch(ordinals.fetch("Target")))
      assert_equal(1, summary.inbound_counts.fetch(ordinals.fetch("Outer::Inner")))
      assert(summary.links.all? { |row| row.length == 2 && row.all?(Integer) })

      aggregates = collected.fetch(:dependency_packages)
      snapshot_packages = aggregates.each_with_index.map do |aggregate, index|
        {
          "name" => "dependency-#{index}",
          "role" => index,
          "location" => 1,
          "ruby_counts" => aggregate.fetch(:ruby_counts),
          "declarations" => aggregate.fetch(:declarations),
        }
      end
      snapshot = {
        "project_name" => "Reference Integration",
        "namespace_names" => namespaces.fetch(:namespace_names),
        "namespaces" => adapter.send(:build_workspace_rows, namespaces, summary.inbound_counts),
        "constant_reference_links" => summary.links,
        "category_stats" => collected.fetch(:category_stats),
        "dependency_signal_maxima" => collected.fetch(:dependency_signal_maxima),
        "packages" => snapshot_packages,
        "warning_counts" => { "manifest" => 0, "index" => 0, "integrity" => 0 },
      }
      model = RubyLens::ArtModelBuilder.new(seed: 12).build(snapshot)
      namespace_count = model.fetch("namespaces").length
      art_workspace_to_dependency = model.fetch("constantReferenceLinks").find do |from_index, to_index|
        model.fetch("namespaceNames").fetch(from_index) == "UsesDependency" &&
          to_index >= namespace_count
      end
      art_test_to_dependency = model.fetch("constantReferenceLinks").find do |from_index, to_index|
        model.fetch("namespaceNames").fetch(from_index) == "TestUsesDependency" &&
          to_index >= namespace_count
      end
      flattened_declarations = snapshot_packages.flat_map { |package| package.fetch("declarations") }
      assert(art_workspace_to_dependency)
      assert(art_test_to_dependency)
      assert_equal(
        flattened_declarations.fetch(dependency_target).drop(1),
        model.fetch("dependencyStars").fetch(art_workspace_to_dependency.fetch(1) - namespace_count).drop(2),
      )
      refute_includes(JSON.generate(summary.links), directory)
    end
  end

  def test_constant_reference_links_allow_every_workspace_category_pair
    Dir.mktmpdir("rubylens-workspace-reference-links-") do |directory|
      root = Pathname(directory).realpath
      core_source = root.join("lib/core_nodes.rb")
      test_source = root.join("test/test_nodes.rb")
      core_source.dirname.mkpath
      test_source.dirname.mkpath
      core_source.write(<<~RUBY)
        class CoreA
          TO_CORE = CoreB
          TO_TEST = TestA
        end

        class CoreB
        end
      RUBY
      test_source.write(<<~RUBY)
        class TestA
          TO_CORE = CoreA
          TO_TEST = TestB
        end

        class TestB
        end
      RUBY

      manifest = Object.new
      manifest.define_singleton_method(:workspace_path?) do |path|
        RubyLens::Paths.inside?(path, root)
      end
      manifest.define_singleton_method(:relative_workspace_path) do |path|
        Pathname(path).relative_path_from(root).to_s
      end
      manifest.define_singleton_method(:packages) { [] }
      adapter = RubyLens::Index::RubydexAdapter.new(manifest)
      graph = Rubydex::Graph.new(workspace_path: root.to_s)
      assert_empty(graph.index_all([core_source.to_s, test_source.to_s]))
      graph.resolve
      collected = adapter.send(:collect_declarations, graph.declarations)
      workspace = adapter.send(
        :workspace_namespaces,
        collected.fetch(:workspace_records),
        [],
        collected.fetch(:workspace_definition_ranges),
      )
      summary = adapter.send(
        :workspace_reference_summary,
        graph,
        workspace,
        collected.fetch(:dependency_ordinal_by_name),
      )
      ordinals = workspace.fetch(:ordinal_by_name)

      assert_equal(
        Set[
          [ordinals.fetch("CoreA"), ordinals.fetch("CoreB")],
          [ordinals.fetch("CoreA"), ordinals.fetch("TestA")],
          [ordinals.fetch("TestA"), ordinals.fetch("CoreA")],
          [ordinals.fetch("TestA"), ordinals.fetch("TestB")],
        ],
        summary.links.to_set,
      )
      rows_by_name = workspace.fetch(:namespace_names).zip(
        adapter.send(:build_workspace_rows, workspace, summary.inbound_counts),
      ).to_h
      assert_equal(0, rows_by_name.fetch("CoreA").fetch(1))
      assert_equal(0, rows_by_name.fetch("CoreB").fetch(1))
      assert_equal(1, rows_by_name.fetch("TestA").fetch(1))
      assert_equal(1, rows_by_name.fetch("TestB").fetch(1))
    end
  end

  def test_constant_reference_summary_does_not_swallow_internal_selection_errors
    manifest = RubyLens::Index::Manifest.build(root: FIXTURE)
    adapter = RubyLens::Index::RubydexAdapter.new(manifest)
    graph = Rubydex::Graph.new(workspace_path: manifest.root.to_s)
    assert_empty(graph.index_all(manifest.files))
    graph.resolve
    indexed_package_document_paths, = adapter.send(:resolve_documents, graph)
    adapter.instance_variable_set(:@indexed_package_document_paths, indexed_package_document_paths)
    collected = adapter.send(:collect_declarations, graph.declarations)
    workspace = adapter.send(
      :workspace_namespaces,
      collected.fetch(:workspace_records),
      [],
      collected.fetch(:workspace_definition_ranges),
    )
    adapter.define_singleton_method(:enclosing_definition_ordinal) do |*|
      raise "broken range selection"
    end

    error = assert_raises(RuntimeError) do
      adapter.send(
        :workspace_reference_summary,
        graph,
        workspace,
        collected.fetch(:dependency_ordinal_by_name),
      )
    end

    assert_equal("broken range selection", error.message)
  end

  def test_constant_reference_summary_keeps_inbound_count_when_range_coordinates_are_unavailable
    location = stub(uri: "file:///workspace/source.rb")
    location.stubs(:comparable_values).raises("location unavailable")
    reference = Rubydex::ResolvedConstantReference.allocate
    reference.stubs(:location).returns(location)
    reference.stubs(:declaration).returns(stub(name: "Target"))
    adapter = RubyLens::Index::RubydexAdapter.new(stub(workspace_path?: true))
    workspace = { records: [], ordinal_by_name: { "Target" => 0 } }

    summary = adapter.send(:workspace_reference_summary, stub(constant_references: [reference]), workspace)

    assert_equal({ 0 => 1 }, summary.inbound_counts)
    assert_empty(summary.links)
  end

  def test_definition_ranges_preserve_innermost_and_ambiguous_containment
    adapter = RubyLens::Index::RubydexAdapter.new(stub)
    uri = "file:///workspace/source.rb"
    ranges = {
      uri => [
        [1, 0, 100, 0, 0],
        [1, 0, 100, 0, 0],
        [10, 0, 20, 0, 1],
        [30, 0, 40, 0, 2],
        [30, 0, 40, 0, 3],
        [60, 0, 90, 0, 4],
        [60, 0, 80, 0, 5],
      ],
    }
    ordinal_at = lambda do |start_line, start_column, end_line, end_column|
      location_values = [uri, start_line, start_column, end_line, end_column]
      adapter.send(:enclosing_definition_ordinal, location_values, ranges)
    end

    assert_equal(1, ordinal_at.call(12, 0, 12, 5))
    assert_nil(ordinal_at.call(35, 0, 35, 5))
    assert_equal(0, ordinal_at.call(50, 0, 50, 5))
    assert_equal(5, ordinal_at.call(70, 0, 70, 5))
    assert_nil(ordinal_at.call(110, 0, 110, 5))
  end

  def test_constant_reference_summary_bounds_attribution_without_truncating_inbound_counts
    uri = "file:///workspace/source.rb"
    location = stub(uri:, comparable_values: [uri, 2, 2, 2, 18])
    dependency_reference = Rubydex::ResolvedConstantReference.allocate
    dependency_reference.stubs(:location).returns(location)
    dependency_reference.stubs(:declaration).returns(stub(name: "DependencyTarget"))
    late_workspace_reference = Rubydex::ResolvedConstantReference.allocate
    late_workspace_reference.stubs(:location).returns(location)
    late_workspace_reference.stubs(:declaration).returns(stub(name: "LateTarget"))
    attribution_limit = RubyLens::Index::RubydexAdapter::CONSTANT_REFERENCE_ATTRIBUTION_LIMIT
    references = Array.new(attribution_limit, dependency_reference) << late_workspace_reference
    workspace = {
      records: [[nil, 1, 0]],
      definition_ranges: { uri => [[1, 0, 10, 0, 0]] },
      namespace_names: ["Origin", "LateTarget"],
      ordinal_by_name: { "Origin" => 0, "LateTarget" => 1 },
    }
    adapter = RubyLens::Index::RubydexAdapter.new(stub(workspace_path?: true))
    attribution_calls = 0
    original_attribution = adapter.method(:enclosing_definition_ordinal)
    adapter.define_singleton_method(:enclosing_definition_ordinal) do |*arguments|
      attribution_calls += 1
      original_attribution.call(*arguments)
    end

    summary = adapter.send(
      :workspace_reference_summary,
      stub(constant_references: references),
      workspace,
      { "DependencyTarget" => 0 },
    )

    assert_equal(attribution_limit, attribution_calls)
    assert_equal({ 1 => 1 }, summary.inbound_counts)
    assert_equal([[0, 2]], summary.links)
  end

  def test_nonworkspace_dependency_references_do_not_consume_the_attribution_budget
    target = stub(name: "DependencyTarget")
    external_location = stub(
      uri: "file:///dependency/source.rb",
      comparable_values: ["file:///dependency/source.rb", 2, 2, 2, 18],
    )
    workspace_uri = "file:///workspace/source.rb"
    workspace_location = stub(uri: workspace_uri, comparable_values: [workspace_uri, 2, 2, 2, 18])
    external_reference = Rubydex::ResolvedConstantReference.allocate
    external_reference.stubs(:declaration).returns(target)
    external_reference.stubs(:location).returns(external_location)
    workspace_reference = Rubydex::ResolvedConstantReference.allocate
    workspace_reference.stubs(:declaration).returns(target)
    workspace_reference.stubs(:location).returns(workspace_location)
    manifest = Object.new
    manifest.define_singleton_method(:workspace_path?) do |path|
      path == "/workspace/source.rb"
    end
    workspace = {
      records: [[nil, 1, 0]],
      definition_ranges: { workspace_uri => [[1, 0, 10, 0, 0]] },
      namespace_names: ["Origin"],
      ordinal_by_name: { "Origin" => 0 },
    }
    references = Array.new(
      RubyLens::Index::RubydexAdapter::CONSTANT_REFERENCE_ATTRIBUTION_LIMIT,
      external_reference,
    ) << workspace_reference

    summary = RubyLens::Index::RubydexAdapter.new(manifest).send(
      :workspace_reference_summary,
      stub(constant_references: references),
      workspace,
      { "DependencyTarget" => 0 },
    )

    assert_equal([[0, 1]], summary.links)
  end

  def test_constant_reference_summary_caps_unique_links
    link_limit = RubyLens::Index::RubydexAdapter::CONSTANT_REFERENCE_LINK_LIMIT
    declaration = Data.define(:name).new("DependencyTarget")
    location_class = Data.define(:uri, :line) do
      def comparable_values = [uri, line, 0, line, 1]
    end
    references = (0..link_limit).map do |index|
      location = location_class.new("file:///workspace/source.rb", index)
      Rubydex::ResolvedConstantReference.allocate.tap do |reference|
        reference.define_singleton_method(:declaration) { declaration }
        reference.define_singleton_method(:location) { location }
      end
    end
    workspace = {
      records: [],
      namespace_names: Array.new(link_limit + 1),
      ordinal_by_name: {},
    }
    adapter = RubyLens::Index::RubydexAdapter.new(stub(workspace_path?: true))
    adapter.define_singleton_method(:enclosing_definition_ordinal) do |location_values, _ranges|
      location_values.fetch(1)
    end

    summary = adapter.send(
      :workspace_reference_summary,
      stub(constant_references: references),
      workspace,
      { "DependencyTarget" => 0 },
    )

    assert_equal(link_limit, summary.links.length)
    assert_equal(summary.links.uniq, summary.links)
  end

  def test_filters_synthetic_declarations_before_visual_aggregation
    Dir.mktmpdir("rubylens-declaration-shapes-") do |directory|
      source_path = File.join(directory, "shapes.rb")
      File.write(source_path, <<~RUBY)
        class Named
          class << self
            def class_method; end
            class << self
              def nested_meta_method; end
            end
          end
        end

        Assigned = Class.new
        Class.new
        Module.new
        Missing::VALUE = 1
        class << Missing; end
        class Missing::Nested; end
      RUBY
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "shapes.rb", exception: true)

      graph = Rubydex::Graph.new(workspace_path: directory)
      assert_empty(graph.index_all([source_path]))
      graph.resolve
      declarations = graph.declarations.to_a
      direct_singleton = declarations.find { |declaration| declaration.name == "Named::<Named>" }
      nested_singleton = declarations.find { |declaration| declaration.name == "Named::<Named>::<<Named>>" }
      todo = declarations.find { |declaration| declaration.is_a?(Rubydex::Todo) && declaration.name == "Missing" }
      todo_singleton = declarations.find { |declaration| declaration.name == "Missing::<Missing>" }
      todo_owned_constant = declarations.find { |declaration| declaration.name == "Missing::VALUE" }
      anonymous = declarations.select { |declaration| declaration.name.include?("<anonymous>") }
      adapter = RubyLens::Index::RubydexAdapter.new(RubyLens::Index::Manifest.build(root: directory))

      assert(adapter.send(:model_eligible_declaration?, direct_singleton))
      refute(adapter.send(:model_eligible_declaration?, nested_singleton))
      refute(adapter.send(:model_eligible_declaration?, todo))
      refute(adapter.send(:model_eligible_declaration?, todo_singleton))
      assert(adapter.send(:model_eligible_declaration?, todo_owned_constant))
      anonymous.each { |declaration| refute(adapter.send(:model_eligible_declaration?, declaration)) }

      snapshot = adapter.index
      serialized = JSON.generate(snapshot)

      assert_equal(%w[Assigned Missing::Nested Named], snapshot.fetch("namespace_names").sort)
      assert_equal({ "core" => [3, 0, 2, 1], "tests" => [0, 0, 0, 0] }, snapshot.fetch("category_stats"))
      refute_includes(serialized, "<anonymous>")
    end
  end

  def test_models_raw_rspec_references_as_statless_nonidentifying_proxies
    manifest = RubyLens::Index::Manifest.build(root: RSPEC_FIXTURE)
    snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
    names = snapshot.fetch("namespace_names")
    rows = names.zip(snapshot.fetch("namespaces")).select do |name, _row|
      name.start_with?("RSpec example group #")
    end
    serialized = JSON.generate(snapshot)

    assert_equal(9, rows.length)
    assert_equal([9, 0, 14, 0], snapshot.fetch("category_stats").fetch("tests"))
    assert(rows.all? { |_name, row| row.length == 13 && row.all?(Integer) })
    assert(rows.all? { |_name, row| row[0] == 0 && row[1] == 1 })
    assert(rows.all? { |_name, row| row.drop(2).all?(&:zero?) })
    assert_equal(rows.length, rows.map(&:first).uniq.length)
    assert_empty(snapshot.fetch("constant_reference_links"))
    assert_equal(
      (1..9).map { |index| format("RSpec example group #%06d", index) },
      rows.map(&:first),
    )
    refute_includes(serialized, RSPEC_FIXTURE.to_s)
    refute_includes(serialized, "service_spec.rb")
    refute_includes(serialized, "space café")
    refute_includes(serialized, "private shared behavior")
    refute_includes(serialized, "crème brûlée")
    refute_includes(serialized, "not an RSpec group")
  end

  def test_preserves_known_project_acronyms
    manifest = Struct.new(:root)
    adapter = ->(root) { RubyLens::Index::RubydexAdapter.new(manifest.new(Pathname(root))) }

    assert_equal("IRB", adapter.call("/tmp/irb").send(:project_name))
    assert_equal("RDoc", adapter.call("/tmp/rdoc").send(:project_name))
  end

  def test_safe_length_uses_size_and_falls_back_to_count
    adapter = RubyLens::Index::RubydexAdapter.new(stub)
    sized = stub(size: 7)
    sized.expects(:count).never
    counted = stub(size: nil, count: 4)
    raised_size = stub(count: 5)
    raised_size.stubs(:size).raises("size unavailable")

    assert_equal(7, adapter.send(:safe_length, stub(records: sized), :records))
    assert_equal(4, adapter.send(:safe_length, stub(records: counted), :records))
    assert_equal(5, adapter.send(:safe_length, stub(records: raised_size), :records))
  end

  def test_collects_declarations_without_materializing_the_enumerable
    declarations = stub(each: nil)
    declarations.expects(:to_a).never

    collected = RubyLens::Index::RubydexAdapter.new(stub(packages: [])).send(:collect_declarations, declarations)

    assert_empty(collected.fetch(:workspace_records))
    assert_equal({ "core" => [0, 0, 0, 0], "tests" => [0, 0, 0, 0] }, collected.fetch(:category_stats))
    assert_empty(collected.fetch(:dependency_packages))
  end

  def test_dependency_extraction_failure_cannot_silently_undercount
    declaration = stub(name: "Broken")
    declaration.stubs(:definitions).raises("broken definitions")
    manifest = stub(packages: [Object.new])

    error = assert_raises(RuntimeError) do
      RubyLens::Index::RubydexAdapter.new(manifest).send(:collect_declarations, [declaration])
    end
    assert_equal("broken definitions", error.message)
  end

  def test_non_file_definitions_are_intentionally_ineligible_for_packages
    location = Struct.new(:uri).new("https://example.test/builtin.rbs")
    manifest = stub
    manifest.expects(:package_index_for).never

    assert_nil(RubyLens::Index::RubydexAdapter.new(manifest).send(:package_index_for_location, location))
  end

  def test_package_attribution_requires_a_document_rubydex_actually_indexed
    Dir.mktmpdir("rubylens-document-authority-") do |directory|
      indexed = File.join(directory, "indexed.rb")
      absent = File.join(directory, "absent.rb")
      File.write(indexed, "Indexed = 1\n")
      File.write(absent, "Absent = 1\n")
      manifest = stub(package_index_for: 3)
      adapter = RubyLens::Index::RubydexAdapter.new(manifest)
      adapter.instance_variable_set(:@indexed_package_document_paths, Set[indexed])

      indexed_location = Struct.new(:uri).new("file://#{indexed}")
      absent_location = Struct.new(:uri).new("file://#{absent}")
      assert_equal(3, adapter.send(:package_index_for_location, indexed_location))
      assert_nil(adapter.send(:package_index_for_location, absent_location))
    end
  end

  def test_indexes_the_exact_git_selected_manifest_once
    graph = stub(documents: [], resolve: nil, check_integrity: [], declarations: [], constant_references: [])
    manifest = Struct.new(:root, :files, :packages, :warnings, :dependency_warnings).new(
      Pathname("/tmp/example"), ["/tmp/a.rb", "/tmp/b.rb"].freeze, [], [], []
    )

    Rubydex::Graph.expects(:new).with(workspace_path: manifest.root.to_s).returns(graph)
    graph.expects(:index_all).with(manifest.files).returns([])
    RubyLens::Index::RubydexAdapter.new(manifest).index

    assert_equal(manifest.files.uniq, manifest.files)
  end

  def test_reuses_indexed_documents_for_package_audit_and_workspace_rspec_projection
    Dir.mktmpdir("rubylens-rspec-package-documents-") do |directory|
      root = Pathname(directory).join("workspace")
      workspace_spec = root.join("spec/workspace_spec.rb")
      dependency_root = root.join("vendor/bundle/ruby/4.0.0/bundler/gems/dependency-abc123")
      dependency_spec = dependency_root.join("spec/dependency_spec.rb")
      FileUtils.mkdir_p(workspace_spec.dirname)
      FileUtils.mkdir_p(dependency_spec.dirname)
      workspace_spec.write("describe(\"workspace\") { it(\"kept\") {} }\n")
      dependency_spec.write("DEPENDENCY_CONST = 1; describe(\"dependency\") { specify(\"hidden\") {} }\n")

      package = RubyLens::Index::Manifest::Package.new(
        "dependency", "1.0.0", "direct", "external", dependency_root.realpath,
        [dependency_spec.realpath.to_s].freeze,
      )
      manifest = Struct.new(:root, :files, :packages, :warnings, :dependency_warnings).new(
        root.realpath,
        [workspace_spec.realpath.to_s, dependency_spec.realpath.to_s].freeze,
        [package].freeze,
        [],
        [],
      )
      manifest.define_singleton_method(:workspace_path?) do |path|
        RubyLens::Paths.inside?(path, root.realpath)
      end
      manifest.define_singleton_method(:relative_workspace_path) do |path|
        Pathname(path).realpath.relative_path_from(root.realpath).to_s
      rescue ArgumentError, Errno::ENOENT
        nil
      end
      manifest.define_singleton_method(:package_index_for) do |path|
        Pathname(path).realpath == dependency_spec.realpath ? 0 : nil
      end

      snapshot = RubyLens::Index::RubydexAdapter.new(manifest).index
      package_row = snapshot.fetch("packages").fetch(0)

      assert_equal(["RSpec example group #000001"], snapshot.fetch("namespace_names"))
      assert_equal(1, snapshot.fetch("category_stats").fetch("tests").fetch(2))
      assert_equal(1, package_row.fetch("declarations").length)
      refute_empty(package_row.fetch("declarations"))
      assert_empty(snapshot.fetch("constant_reference_links"))
    end
  end

  def test_compacts_dependency_declarations_without_embedding_their_names
    Dir.mktmpdir("rubylens-package-declarations-") do |directory|
      lib = File.join(directory, "lib")
      Dir.mkdir(lib)
      File.write(File.join(lib, "client.rb"), "class DependencyClient < Minitest::Test\nend\n")
      File.write(
        File.join(directory, "Gemfile.lock"),
        <<~LOCKFILE,
          GEM
            remote: https://rubygems.org/
            specs:
              minitest (6.0.6)

          PLATFORMS
            arm64-darwin

          DEPENDENCIES
            minitest (= 6.0.6)

          BUNDLED WITH
             4.0.1
        LOCKFILE
      )
      system("git", "-C", directory, "init", "--quiet", exception: true)
      system("git", "-C", directory, "add", "lib/client.rb", "Gemfile.lock", exception: true)

      snapshot = RubyLens::Index::RubydexAdapter.new(RubyLens::Index::Manifest.build(root: directory)).index
      package = snapshot.fetch("packages").find { |row| row.fetch("name") == "minitest" }

      assert(package)
      refute_empty(package.fetch("declarations"))
      assert(package.fetch("declarations").all? { |row| row.length == 7 && row.all?(Integer) })
      refute_includes(JSON.generate(snapshot), directory)
      refute_includes(JSON.generate(snapshot), "Minitest::Test")
    end
  end

end
