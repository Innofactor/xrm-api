var Serializer = function() {
  /*
    result.EntityName = 'leadsrelation';
    result.EntityId = 'e21a10ec-8209-e111-8660-00155d31e39f';
    result.RelationShip = { PrimaryEntityRole : 'Referencing', SchemaName: 'connectionroleassociation_association'};
    result.RelatedEntities = [
        {
            Id : '29F08E80-4F2B-E111-BD15-00155D31F746',
            LogicalName : 'account',
            Name : 'account'
        }
    ];
    */

  this.toXmlRetrieveMultiple = function(options) {
    var xml = "";

    if (options.id) {
      xml += "<b:id>" + options.id + "</b:id>";
    }

    if (options.ColumnSet) {
      var columset = options.ColumnSet.map(function(c) {
        return "<c:string>" + c + "</c:string>";
      });

      xml +=
        "<b:ColumnSet>" +
        "<b:AllColumns>false</b:AllColumns>" +
        '<b:Columns xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">' +
        columset.join("") +
        "</b:Columns>" +
        "</b:ColumnSet>";
    } else {
      xml +=
        "<b:ColumnSet>" +
        "<b:AllColumns>true</b:AllColumns>" +
        '<b:Columns xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays"></b:Columns>' +
        "</b:ColumnSet>";
    }

    if (options.Criteria) {
      if (options.Criteria.Conditions) {
        const conditions = options.Criteria.Conditions.map(c => {
          return `\n<b:ConditionExpression>
                       <b:AttributeName>${c.AttributeName}</b:AttributeName>
                       <b:Operator>${c.Operator}</b:Operator>
                       <b:Values xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">                        
                        <c:anyType i:type="d:string" xmlns:d="http://www.w3.org/2001/XMLSchema">${
                          c.Value
                        }</c:anyType>
                       </b:Values>
                     </b:ConditionExpression>`;
        });

        const xmlConditions = `\n<b:Conditions>
                                       ${conditions.join("")}
                                   </b:Conditions>`;

        if (options.Criteria.FilterOperators) {
          const filters = options.Criteria.FilterOperators.map(c => {
            return `<b:FilterOperator>${c}</b:FilterOperator>`;
          });
          xml += `\n<b:Criteria>                         
                    ${xmlConditions}   
                    ${filters.join("")}
                    <a:Filters />   
                    <a:IsQuickFindFilter>false</a:IsQuickFindFilter>                   
                   </b:Criteria>`;
        }
      }
    }

    if (options.EntityName) {
      xml += "<b:EntityName>" + options.EntityName + "</b:EntityName>";
    }

    xml += "<b:Distinct>false</b:Distinct>";

    if (options.LinkEntities) {
      const linkEntityXml = options.LinkEntities.map(linked => {
        let xmlConditions = '';
        if (options.Criteria && options.Criteria.Conditions) {
          const conditionXml = linked.Criteria.Conditions.map(c => {
            return `\n<b:Condition>
                         <b:AttributeName>${c.AttributeName}</b:AttributeName>
                         <b:Operator>${c.Operator}</b:Operator>
                         <b:Values xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">                        
                          <c:anyType i:type="d:string" xmlns:d="http://www.w3.org/2001/XMLSchema">${
                            c.Value
                          }</c:anyType>
                         </b:Values>
                       </b:Condition>`;
          });

          xmlConditions = `\n<b:Conditions>
                        ${conditionXml.join("")}
                      </b:Conditions>`;
        }

        let filters = '';
        if (linked.Criteria.FilterOperators) {
          filters = linked.Criteria.FilterOperators.map(c => {
            return `<b:FilterOperator>${c}</b:FilterOperator>`;
          });
        }

        return `\n<b:LinkEntity>
                     <b:LinkFromAttributeName>${
                       linked.LinkFromAttributeName
                     }</b:LinkFromAttributeName>
                     <b:LinkFromEntityName>${
                       linked.LinkFromEntityName
                     }</b:LinkFromEntityName>
                     <b:LinkToEntityName>${
                       linked.LinkToEntityName
                     }</b:LinkToEntityName>
                     <b:LinkToAttributeName>${
                       linked.LinkToAttributeName
                     }</b:LinkToAttributeName>
                     <b:JoinOperator>${linked.JoinOperator}</b:JoinOperator>
                     <a:LinkCriteria>
                     ${filters.join("")}
                     ${xmlConditions.join("")}                     
                     </a:LinkCriteria>
                   </b:LinkEntity>`;
      });

      xml += "<b:LinkEntities>" + linkEntityXml.join("") + "</b:LinkEntities>";
    } else {
      xml += "<b:LinkEntities />";
    }

    if (!options.Order) {
      xml += "<b:Orders />";
    } else {
      const orderBy = options.Order.Conditions.map(c => {
        return `<b:Order>
                    <b:AttributeName>${c.AttributeName}</b:AttributeName>
                    <b:OrderType>${c.OrderType}</b:OrderType>
                  </b:Order>`;
      });
      xml += `\n<b:Orders>                  
                     ${orderBy.join("")}
                  </b:Orders>`;
    }

    if (options.TopCount) {
      xml += "<b:TopCount>" + options.TopCount + "</b:TopCount>";
    }

    var pageInfo = options.PageInfo || {};
    pageInfo.Count = pageInfo.Count || 0;
    pageInfo.PageNumber = pageInfo.PageNumber || 0;
    pageInfo.PagingCookie = pageInfo.PagingCookie || null;

    xml +=
      "<b:PageInfo><b:Count>" +
      pageInfo.Count +
      "</b:Count><b:PageNumber>" +
      pageInfo.PageNumber +
      "</b:PageNumber>";

    if (pageInfo.PagingCookie === null) {
      xml += "<b:PagingCookie i:nil='true'/>";
    } else {
      xml += "<b:PagingCookie>" + pageInfo.PagingCookie + "</b:PagingCookie>";
    }

    xml +=
      "<b:ReturnTotalRecordCount>true</b:ReturnTotalRecordCount></b:PageInfo>";
    return xml;
  };

  this.toXmlAssociate = function(options) {
    var xml = "";

    if (options.EntityName) {
      xml += "<entityName>" + options.EntityName + "</entityName>";
    }

    if (options.EntityId) {
      xml += "<entityId>" + options.EntityId + "</entityId>";
    }

    if (options.RelationShip) {
      if (options.RelationShip.SchemaName) {
        //options.RelationShip.PrimaryEntityRole && //<b:PrimaryEntityRole>"+ options.RelationShip.PrimaryEntityRole + "</b:PrimaryEntityRole>
        xml +=
          "<relationship><b:SchemaName>" +
          options.RelationShip.SchemaName +
          "</b:SchemaName></relationship>";
      }
    }

    if (options.RelatedEntities) {
      var atts = options.RelatedEntities.map(function(c) {
        return (
          "<b:EntityReference><b:Id>" +
          c.Id +
          "</b:Id><b:LogicalName>" +
          c.LogicalName +
          "</b:LogicalName><b:Name>" +
          c.Name +
          "</b:Name></b:EntityReference>"
        );
      });
      xml += "<relatedEntities>" + atts.join("") + "</relatedEntities>";
    }

    return xml;
  };
  /*
    {
        LogicalName : "?",
        Attributes : [ 
            {
                key: "x", 
                value: "y"
            } ],
        FormatedValues : [ 
            {
                key:"x", 
                value:"y"
            } ]
    }
    */
  this.toXmlCreateUpdate = function(options) {
    var xml = "";
    if (options.Attributes) {
      var atts = options.Attributes.map(function(c) {
        return (
          "<b:KeyValuePairOfstringanyType><c:key>" +
          c.key +
          '</c:key><c:value  i:type="d:string" xmlns:d="http://www.w3.org/2001/XMLSchema">' +
          c.value +
          "</c:value></b:KeyValuePairOfstringanyType>"
        );
      });
      xml += "<b:Attributes>" + atts.join("") + "</b:Attributes>";
    }
    if (options.id) {
      xml += "<b:Id>" + options.id + "</b:Id>";
    }

    if (options.FormatedValues) {
      var atts = options.FormatedValues.map(function(c) {
        return (
          "<c:key>" +
          c.key +
          '</c:key><c:value  i:type="d:string" xmlns:d="http://www.w3.org/2001/XMLSchema">' +
          c.value +
          "</c:value>"
        );
      });
      xml += "<b:FormattedValues>" + atts.join("") + "</b:FormattedValues>";
    }

    if (options.LogicalName) {
      xml += "<b:LogicalName>" + options.LogicalName + "</b:LogicalName>";
    }
    return xml;
  };

  /*
    {
       EntityName : "?",
       Id : "guid"
    }
    */
  this.toXmlDelete = function(options) {
    var xml = "";
    if (options.EntityName) {
      xml += "<entityName>" + options.EntityName + "</entityName>";
    }

    if (options.id) {
      xml += "<id>" + options.id + "</id>";
    }
    return xml;
  };

  /*
    {
        RequestName : "?",
        RequestId : "guid",
        Parameters : [ 
            {
                key:"x", 
                value:"y"
            } ]
    }
    */
  this.toXmlExecute = function(options) {
    var xml = "";

    if (options.RequestName) {
      xml = "<b:RequestName>" + options.RequestName + "</b:RequestName>";
    }

    if (options.RequestId) {
      xml += "<b:RequestId>" + options.RequestId + "</b:RequestId>";
    }

    if (options.Parameters) {
      var atts = options.Parameters.map(function(c) {
        return (
          "<b:KeyValuePairOfstringanyType><c:key>" +
          c.key +
          '</c:key><c:value  i:type="d:string" xmlns:d="http://www.w3.org/2001/XMLSchema">' +
          c.value +
          "</c:value></b:KeyValuePairOfstringanyType>"
        );
      });
      xml += "<b:Parameters>" + atts.join("") + "</b:Parameters>";
    }

    return xml;
  };

  /* Para asociar y desasociar
    {
        EntityName: "?",
        EntityId: "guid",
        Relationship : 
            { 
                PrimaryEntityRole : "?", 
                SchemaName: "?" 
            },
        RelatedEntities: [ 
            { 
                Id : "guid", 
                LogicalName: "?", 
                Name : "?"  
            } ]
    }
    */
  this.toXmlAsociation = function(options) {
    var xml = "";

    if (options.EntityName) {
      xml += "<b:entityName>" + options.EntityName + "</b:entityName>";
    }

    if (options.EntityId) {
      xml += "<b:entityId>" + options.EntityId + "</b:entityId>";
    }
    if (options.Relationship.SchemaName) {
      xml +=
        "<relationship><b:SchemaName>" +
        options.Relationship.SchemaName +
        "</b:SchemaName></relationship>";
    }
    if (options.RelatedEntities) {
      var atts = options.RelatedEntities.map(function(c) {
        return (
          "<b:EntityReference><b:Id>" +
          c.Id +
          "</b:Id><b:LogicalName>" +
          c.LogicalName +
          "</b:LogicalName><b:Name>" +
          c.Name +
          "</b:Name></b:EntityReference>"
        );
      });
      xml += "<relatedEntities>" + atts.join("") + "</relatedEntities>";
    }

    return xml;
  };

  this.toXmlRetrieve = function(options) {
    var xml;

    if (options.EntityName) {
      xml = "<entityName>" + options.EntityName + "</entityName>";
    }

    if (options.id) {
      xml += "<id>" + options.id + "</id>";
    }

    if (options.ColumnSet) {
      var columset = options.ColumnSet.map(function(c) {
        return "<c:string>" + c + "</c:string>";
      });
      xml +=
        "<columnSet><b:AllColumns>false</b:AllColumns><b:Columns>" +
        columset.join("") +
        "</b:Columns></columnSet>";
    }
    return xml;
  };
};

module.exports = Serializer;
