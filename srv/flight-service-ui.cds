using { FlightService } from './flight-service';

annotate FlightService.Flights with @(
  UI.SelectionFields: [
    carrierID,
    connectionID
  ],
  Search.searchable: true
);

annotate FlightService.Flights with @(
  UI.LineItem: [
    { Value: carrierID },
    { $Type: 'UI.DataFieldWithIntentBasedNavigation',
      Value: connectionID,
      SemanticObject: 'Flight',
      Action: 'displayFactSheet' },
    { Value: flightDate },
    { Value: price, Criticality: priceCriticality },
    { Value: bookedSeats },
    { Value: plannedSeats },

    // BOUND action — needs a selected row
    { $Type: 'UI.DataFieldForAction',
      Action: 'FlightService.cancelFlight',
      Label: 'Cancel Flight' }

    // Note: the "Create Booking" toolbar button is a plain custom action wired up in
    // manifest.json (ext/controller/OpenBookingsDialog.js), not an annotation-based
    // action — SAP FE always resets an annotation action's "press" back to its own
    // default handler, so a custom flow can't be attached to one this way.
  ]
);

annotate FlightService.Flights with @(
  UI.HeaderInfo: {
    TypeName: 'Flight',
    TypeNamePlural: 'Flights',
    Title: { Value: connectionID },
    Description: { Value: carrierID }
  },
  UI.Facets: [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'FlightDetails',
      Label : 'Flight Details',
      Facets: [{
        $Type : 'UI.ReferenceFacet',
        ID    : 'GeneralData',
        Label : 'General Data',
        Target: '@UI.FieldGroup#GeneralData'
      }]
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Bookings',
      Label : 'Bookings',
      Target: 'bookings/@UI.LineItem'
    }
  ],

  UI.FieldGroup #GeneralData: {
    Data: [
      { Value: flightDate },
      { Value: price, ![@Common.FieldControl]: priceFieldControl },
      { Value: currency_code },
      { Value: bookedSeats },
      { Value: plannedSeats },
      { Value: seatsAvailable }

    ]
  }
);

annotate FlightService.Flights with @(
  UI.SelectionPresentationVariant #Open: {
    Text: 'Open',
    SelectionVariant: {
      SelectOptions: [{ PropertyName: isFullyBooked,
        Ranges: [{ Sign: #I, Option: #EQ, Low: false }] }]
    },
    PresentationVariant: { Visualizations: ['@UI.LineItem'] }
  },
  UI.SelectionPresentationVariant #Closed: {
    Text: 'Closed',
    SelectionVariant: {
      SelectOptions: [{ PropertyName: isFullyBooked,
        Ranges: [{ Sign: #I, Option: #EQ, Low: true }] }]
    },
    PresentationVariant: { Visualizations: ['@UI.LineItem'] }
  }
);

annotate FlightService.Flights with {
  priceCriticality  @UI.Hidden: true;
  priceFieldControl @UI.Hidden: true;
  isFullyBooked     @UI.Hidden: true;
};

annotate FlightService.Bookings with @(
  UI.LineItem: [
    { Value: bookingID },
    { Value: customerID },
    { Value: passengerName },
    { Value: bookingClass },
    { Value: foreignCurrencyAmount, Label: 'Amount' },
    { Value: cancelled }
  ]
);

