//
//  RLSJourney.h
//  Railsponsibility
//
//  Created by Matias Piipari on 22/02/2014.
//  Copyright (c) 2014 Railsponsibility. All rights reserved.
//

#import <Foundation/Foundation.h>

#import <UIKit/UIKit.h>

#import "JSONModel.h"

typedef NS_ENUM(NSUInteger, RLSTicketType)
{
    RLSTicketTypeUndefined = 0,
    RLSTicketTypeSeason = 1,
    RLSTicketTypeSingle = 2,
    RLSTicketTypeReturn = 3
};

@interface RLSJourney : JSONModel

@property (readwrite) NSString *origin;
@property (readwrite) NSString *destination;

@property (readwrite) NSDate *scheduledDepartureDate;
@property (readwrite) NSDate *scheduledArrivalDate;

@property (readwrite) NSDate *actualDepartureDate;
@property (readwrite) NSDate *actualArrivalDate;

@property (readonly) NSTimeInterval delay;

#pragma mark - Ticket details

@property (readonly) NSString *issuingTicketOffice;
@property (readonly) NSString *ticketNumber;

@property (readonly) NSNumber *ticketPrice;

@property (readonly) NSDate *ticketStartDate;
@property (readonly) NSDate *ticketExpiryDate;

@property (readonly) UIImage *ticketImage;

@end