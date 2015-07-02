angular.module('grid').factory('gridForm', gridForm);
gridForm.$inject = ['grid-entity', '$timeout', '_'];
function gridForm(gridEntity, $timeout, _) {

  function Form(model) {
    this.setModel(model);

    this.form = [];
    this.model = {};
    this.schema = {};
    this.links = {};
  }

  Form.prototype = new gridEntity();

  angular.extend(Form.prototype, {
    getFormInfo: getFormInfo,
    getConfig: getConfig,
    _getEnumValues: _getEnumValues,
    _getTitleMapsForRelations: _getTitleMapsForRelations,
    _createTitleMap: _createTitleMap,
    _getFormConfig: _getFormConfig,
    _getFieldsForm: _getFieldsForm,
    _fieldsToFormFormat: _fieldsToFormFormat,
    _getFormButtonBySchema: _getFormButtonBySchema
  });

  return Form;

  function getConfig() {
    var self = this;
    return {
      form: self.form,
      model: self.model,
      schema: self.schema,
      links: self.links
    }
  }

  /**
   *
   * @param callback
   */
  function getFormInfo(callback) {
    /*jshint validthis: true */
    var self = this;
    var model = self.getModel();
    var url;

    url = self.getResourceUrl(model.url, model.params);

    $timeout(function() {
      self.fetchData(url, fetchDataSuccess);
    });

    function fetchDataSuccess(data, schema) {
      var newData = data.property('data').property('attributes');
      var schemaWithoutRef = self.mergeRelSchema(newData.schemas()[0].data.value(), schema);

      self._getFieldsForm(data, function(fields) {

        self.links = data.links();
        self.schema = schemaWithoutRef;
        self.model = self._fieldsToFormFormat(fields);

        self._getFormConfig(data, callbackFormConfig);

        function callbackFormConfig(config) {
          self.form = config;

          /** add button to config form */
          self.form = _.union(self.form, self._getFormButtonBySchema(data.property('data').links()));

          if (callback !== undefined) {
            callback(self.getConfig());
          }
        }

      })

    }

  }

  /**
   * Convert Jsonary Data to result model for rendering form
   *
   * @param resource
   * @returns {*}
   */
  function _fieldsToFormFormat(resource) {
    var data = resource.own;
    var fields = data.property('attributes').value();

    _.forEach(resource.relationships, function(relation, key) {
      fields[key] = _.map(relation, function(relationItem) {
        return relationItem.property('data').propertyValue('id');
      });
      /** check if data as array then return string else array */
      if (!Array.isArray(data.property('relationships').property(key).propertyValue('data'))) {
        fields[key] = fields[key][0];
      }
    });

    return fields;
  }

  /**
   * Generate form config for Angular schema form
   * @param data
   * @param callback
   * @private
   */
  function _getFormConfig(data, callback) {
    var self = this;

    var result = [];

    self._createTitleMap(data.property('data'), function(titleMaps) {

      var attributes = self.mergeRelSchema(
        data.property('data').schemas()[0].data.value(),
        data.schemas()[0].data.document.raw.value()
      ).properties.attributes.properties;

      _.forEach(attributes, function(value, key) {
        var obj = {key: key};

        if (titleMaps[key]) {
          obj.titleMap = titleMaps[key]
        }
        result.push(obj)
      });

      $timeout(function() {
        callback(result);
      });

    });
  }

  function _getFieldsForm(data, callback) {
    var self = this;
    var fields;
    var included = [];

    fields = data.property('data');
    included.push(self._getRelationResource(data.property('data')));

    self._batchLoadData(included, batchLoaded);

    function batchLoaded(relationResources) {

      var result = {
        own: fields,
        relationships: _.mapValues(relationResources[0], function(n) {
          _.forEach(n, function(item, index) {
            n[index] = item.data;
          });
          return n;
        })
      };

      callback(result);
    }
  }

  /**
   * Get enum values for schema with allOf
   *
   * @param schema
   * @returns {{}}
   * @private
   */
  function _getEnumValues(schema) {
    var enumValues = {};
    var schemaList = schema.andSchemas().length ? schema.andSchemas() : schema.asList();

    if (schemaList.enumValues()) {
      enumValues = schemaList.enumValues()
    } else {

      schemaList.each(function(index, value) {
        if (value.itemSchemas().enumValues()) {
          enumValues = value.itemSchemas().enumValues();
        }
      })
    }

    return enumValues;
  }

  function _getTitleMapsForRelations(data) {
    var self = this;
    var sourceTitleMaps = [];

    var dataRelations = data.property('relationships');
    var dataAttributes = data.property('attributes');

    var documentSchema = data.schemas()[0].data.document.raw.value();

    _.forEach(data.relationships(), function(item, key) {

      var resourceLink = item.links.self;
      /** get name from schema */
      var attributeName = dataRelations.property(key).schemas().relationField();
      var schemaAttributeWithoutRef = self._replaceFromFull(
        dataAttributes.schemas()[0].data.value(),
        documentSchema
      )['properties'][key];

      var schema = Jsonary.createSchema(schemaAttributeWithoutRef);
      var sourceEnum = self._getEnumValues(schema);

      _.forEach(sourceEnum, function(enumItem) {
        var url = self.getResourceUrl(resourceLink, {type: self.default.actionGetResource, id: enumItem});

        sourceTitleMaps.push({
          url: url,
          enumItem: enumItem,
          relationName: key,
          attributeName: attributeName
        })
      });

    });
    return sourceTitleMaps;
  }

  /**
   * Create titleMap for form and load dependency resource
   * @param data
   * @param callback
   * @private
   */
  function _createTitleMap(data, callback) {
    var self = this;

    var sourceTitleMaps = self._getTitleMapsForRelations(data);

    self.fetchCollection(_.map(sourceTitleMaps, 'url'), function(resources) {
      var titleMaps = {};

      _.forEach(sourceTitleMaps, function(item) {

        if (!titleMaps[item.relationName]) {
          titleMaps[item.relationName] = [];
        }

        titleMaps[item.relationName].push({
          value: item.enumItem,
          //value: data.property('data').propertyValue('id'),
          name: resources[item.url].data.property('data').property('attributes')
            .propertyValue(item.attributeName) || item.enumItem
        });
      });

      callback(titleMaps)
    });

  }

  /**
   * Generate config for rendering buttons from schema links
   *
   * @param links
   * @returns {Array}
   */
  function _getFormButtonBySchema(links) {
    var result = [];
    _.forEach(links, function(value) {
      result.push({
        type: 'button',
        title: value.title,
        link: value,
        onClick: 'edit($event, form)'
      });
    });
    return result;
  }

}
